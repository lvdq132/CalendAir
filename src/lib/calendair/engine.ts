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
  safeOffers: number;
  idealMatches: number;
  relaxedMatches: number;
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
  // Atlas accepts a return *date*, while CALENDAIR owns an exact arrival
  // deadline. Querying the next-commitment date used to ask Atlas for Monday
  // returns even when an eight-hour safety buffer meant the traveller really
  // had to be home Sunday evening. The engine then correctly rejected every
  // result as late. Move the provider query itself to the latest safe arrival
  // instant; the exact timestamps are still checked again below.
  const latestSafeArrival = new Date(
    Math.min(
      Date.parse(input.window.endIso),
      Date.parse(input.nextCommitmentIso) - input.taste.returnBufferMinutes * 60_000,
    ),
  ).toISOString();

  return {
    origin: input.window.originAirport,
    departureAfter: input.window.startIso,
    returnBefore: latestSafeArrival,
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
      "Filtering for safety",
      `${rejected.length} unsafe · ${scored.length} safe`,
      true,
    ),
  );

  // Full preference matches lead whenever they exist. If none exist, rank the
  // safe offers by fewest relaxations and then score. This is the graceful
  // fallback: it can relax comfort, never calendar, budget or bookability.
  const byScore = (a: ScoredTrip, b: ScoredTrip) =>
    b.escapeScore - a.escapeScore ||
    a.totalPrice - b.totalPrice ||
    b.usefulMinutes - a.usefulMinutes;
  const ideal = scored.filter((trip) => trip.relaxedPreferences.length === 0).sort(byScore);
  const relaxed = scored
    .filter((trip) => trip.relaxedPreferences.length > 0)
    .sort((a, b) => a.relaxedPreferences.length - b.relaxedPreferences.length || byScore(a, b));
  const ranked = ideal.length > 0 ? [...ideal, ...relaxed] : relaxed;
  const [lead, ...rest] = ranked;
  const fallback = Boolean(lead && ideal.length === 0);
  const recommended = lead
    ? fallback
      ? {
          ...lead,
          bestAvailableMatch: true,
          opportunityType: "best-available" as const,
          reasons: [
            `${lead.relaxedPreferences.length === 1 ? "One preference" : `${lead.relaxedPreferences.length} preferences`} relaxed · still fits your schedule.`,
            ...lead.reasons,
          ],
        }
      : lead
    : undefined;

  activity.push(
    event(
      "CALENDAIR",
      "Scoring and ranking",
      recommended
        ? fallback
          ? `${recommended.destinationName} is the best safe option · ${recommended.relaxedPreferences.length} preference${recommended.relaxedPreferences.length === 1 ? "" : "s"} relaxed`
          : `${recommended.destinationName} leads on ${recommended.escapeScore}`
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
    constraintsActive: 4 + (input.window.companionIds.length > 0 ? 1 : 0),
    safeOffers: scored.length,
    idealMatches: ideal.length,
    relaxedMatches: relaxed.length,
    providerUnavailable,
    providerUnavailableDetail,
  };
}

/** Companion helper for the UI: the ids that made the window shared. */
export { type Companion };
