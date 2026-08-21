import { AtlasProviderUnavailableError, type AtlasAdapter } from "@/lib/atlas";
import { checkHardConstraints, type ConstraintContext } from "./constraints";
import { scoreOffer } from "./scoring";
import type {
  AgentActivity,
  DetectedWindow,
  FlightSearchInput,
  NormalizedOffer,
  RejectedCandidate,
  ScoredTrip,
  TravelTaste,
} from "./types";
import { overlaps } from "./time";
import type { Companion } from "./types";

/**
 * The Opportunity Engine.
 *
 * Window in, one recommendation out. Everything between is deterministic: the
 * search constraints, the hard filter, the score and the ranking. The only thing
 * a language model may touch afterwards is the wording of "why this works".
 */

export interface EngineInput {
  window: DetectedWindow;
  taste: TravelTaste;
  companions: Companion[];
  nextCommitmentIso: string;
  adults?: number;
}

export interface EngineResult {
  searchInput: FlightSearchInput;
  recommended?: ScoredTrip;
  alternates: ScoredTrip[];
  rejected: RejectedCandidate[];
  activity: AgentActivity[];
  scanned: number;
  constraintsActive: number;
  /**
   * True when the provider could not be reached at all — even after retries
   * — rather than a search that genuinely returned nothing. Never collapse
   * this into `!recommended`: the two are different facts. See
   * AtlasProviderUnavailableError and BookingState "PROVIDER_UNAVAILABLE".
   */
  providerUnavailable: boolean;
  providerUnavailableDetail?: string;
}

let activitySeq = 0;
function event(
  source: AgentActivity["source"],
  title: string,
  detail: string,
  ok = true,
  durationMs?: number,
): AgentActivity {
  activitySeq += 1;
  return {
    id: `act-${activitySeq}`,
    atIso: new Date().toISOString(),
    source,
    title,
    detail,
    ok,
    durationMs,
  };
}

/** FR-002 — availability only. Companion event titles never enter this function. */
export function companionOverlap(
  window: DetectedWindow,
  companions: Companion[],
): { free: string[]; conflicted: string[] } {
  const free: string[] = [];
  const conflicted: string[] = [];
  for (const c of companions) {
    const clash = c.busy.some((b) =>
      overlaps(b, { startIso: window.startIso, endIso: window.endIso }),
    );
    (clash ? conflicted : free).push(c.id);
  }
  return { free, conflicted };
}

export function buildSearchInput(input: EngineInput): FlightSearchInput {
  return {
    origin: input.window.originAirport,
    departureAfter: input.window.startIso,
    returnBefore: input.window.endIso,
    adults: input.adults ?? (input.window.companionIds.length > 0 ? 2 : 1),
    cabin: "ECONOMY",
    nonstopPreferred: input.taste.directPreferred,
  };
}

export async function runOpportunityEngine(
  atlas: AtlasAdapter,
  input: EngineInput,
): Promise<EngineResult> {
  const activity: AgentActivity[] = [];
  const { free } = companionOverlap(input.window, input.companions);
  const companionAvailable = input.window.companionIds.length === 0 || free.length > 0;

  activity.push(
    event(
      "CALENDAR",
      "Understanding your window",
      `${input.window.hours} hours open from ${input.window.originAirport} · free/busy only`,
    ),
  );

  if (input.companions.length > 0) {
    activity.push(
      event(
        "CALENDAR",
        "Checking shared availability",
        companionAvailable
          ? `${input.companions.length} companion calendar matched on availability alone`
          : "Companion has a conflict inside this window",
        companionAvailable,
      ),
    );
  }

  const searchInput = buildSearchInput(input);
  activity.push(
    event(
      "CALENDAIR",
      "Applying constraints",
      [
        `Budget ≤ ${input.taste.currency} ${input.taste.maxSpontaneousSpend.toLocaleString("en-US")}`,
        input.taste.directPreferred ? "Non-stop preferred" : "Connections allowed",
        `≥ ${input.taste.minUsefulHours}h on the ground`,
        `≥ ${Math.round(input.taste.returnBufferMinutes / 60)}h return buffer`,
      ].join(" · "),
    ),
  );

  const started = Date.now();
  let offers: NormalizedOffer[] = [];
  let providerUnavailable = false;
  let providerUnavailableDetail: string | undefined;
  try {
    offers = await atlas.searchFlights(searchInput);
    activity.push(
      event(
        "ATLAS",
        "Searching live inventory",
        `${offers.length} itineraries returned for ${searchInput.origin}`,
        true,
        Date.now() - started,
      ),
    );
  } catch (err) {
    if (!(err instanceof AtlasProviderUnavailableError)) throw err;
    // A provider outage, not a market with nothing in it — see EngineResult
    // .providerUnavailable. The engine still returns a normal EngineResult
    // (with zero offers) rather than throwing, so callers get one consistent
    // shape to read regardless of what happened.
    providerUnavailable = true;
    providerUnavailableDetail = err.message;
    activity.push(event("ATLAS", "Provider unavailable", err.message, false, Date.now() - started));
  }

  const ctx: ConstraintContext = {
    window: input.window,
    taste: input.taste,
    nextCommitmentIso: input.nextCommitmentIso,
    companionAvailable,
  };

  const scored: ScoredTrip[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const offer of offers) {
    const verdict = checkHardConstraints(offer, ctx);
    if (!verdict.ok) {
      if (verdict.rejection) rejected.push(verdict.rejection);
      continue;
    }
    scored.push(scoreOffer(offer, verdict, ctx));
  }

  activity.push(
    event(
      "CALENDAIR",
      "Filtering on hard constraints",
      `${rejected.length} rejected · ${scored.length} viable`,
      true,
    ),
  );

  // Best score wins; ties break on the cheaper fare, then the longer stay.
  scored.sort(
    (a, b) =>
      b.escapeScore - a.escapeScore ||
      a.totalPrice - b.totalPrice ||
      b.usefulMinutes - a.usefulMinutes,
  );

  const [recommended, ...rest] = scored;

  activity.push(
    event(
      "CALENDAIR",
      "Scoring and ranking",
      recommended
        ? `${recommended.destinationName} leads on ${recommended.escapeScore}`
        : providerUnavailable
          ? "Skipped — the provider could not be reached"
          : "No itinerary cleared every hard constraint",
      Boolean(recommended),
    ),
  );

  return {
    searchInput,
    recommended,
    // FR-006: one hero recommendation, at most two alternates.
    alternates: rest.slice(0, 2),
    rejected,
    activity,
    scanned: offers.length,
    constraintsActive: 9,
    providerUnavailable,
    providerUnavailableDetail,
  };
}

/** Companion helper for the UI: the ids that made the window shared. */
export { type Companion };
