import { DESTINATION_BY_IATA } from "./destinations";
import type {
  NormalizedOffer,
  OpportunityType,
  ScoreFactor,
  ScoredTrip,
  SpontaneityLevel,
  TasteTag,
} from "./types";
import type { ConstraintContext, ConstraintVerdict } from "./constraints";
import { humaniseStay, minutesBetween } from "./time";

/**
 * FR-005 — the Escape Score.
 *
 * A transparent 0–100 built from nine deterministic factors. It measures how
 * well a trip fits a life, not how luxurious it is: an expensive itinerary that
 * lands an hour before a Monday meeting scores badly, and should.
 *
 * A model may later phrase *why* a trip fits. It never moves these numbers.
 */

const WEIGHTS = {
  calendarFit: 18,
  usefulHours: 20,
  budgetFit: 12,
  fareValue: 10,
  affinity: 16,
  companion: 10,
  convenience: 8,
  returnSafety: 6,
} as const;

/** Roughly the most ground time an opening of a given length can yield. */
const PRACTICAL_GROUND_SHARE = 0.55;

/**
 * What a destination outside the dream list is worth before interests are counted.
 *
 * This is the whole mechanical effect of the spontaneity setting: an appetite for
 * the unfamiliar, and nothing else. It cannot touch a budget, a duration, a
 * buffer or a booking safeguard, because it is only ever read here.
 */
const EXPLORATION_BASELINE: Record<SpontaneityLevel, number> = {
  safe: 0.3,
  curious: 0.4,
  wild: 0.55,
};

/** How much a full set of matching interests can lift destination affinity. */
const INTEREST_LIFT = 0.35;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 10) / 10;

export function scoreOffer(
  offer: NormalizedOffer,
  verdict: ConstraintVerdict,
  ctx: ConstraintContext,
): ScoredTrip {
  const dest = DESTINATION_BY_IATA[offer.destination];
  const taste = ctx.taste;
  const factors: ScoreFactor[] = [];

  // How much of the opening the trip actually uses, without straining it.
  const windowMinutes = minutesBetween(ctx.window.startIso, ctx.window.endIso);
  const tripMinutes = minutesBetween(offer.outboundDepartureIso, offer.returnArrivalIso!);
  // Using the opening well is the point. Whether the return is uncomfortably
  // close to the next commitment is measured separately, by return safety.
  const use = clamp01(tripMinutes / windowMinutes);
  const calendarFit = WEIGHTS.calendarFit * clamp01(use / 0.85);
  factors.push({
    id: "calendarFit",
    label: "Calendar fit",
    points: round(calendarFit),
    max: WEIGHTS.calendarFit,
    detail: `Uses ${Math.round(use * 100)}% of the opening`,
  });

  // Hours on the ground, measured against a comfortable three days.
  const usefulHours = verdict.usefulMinutes / 60;
  const practicalMax = Math.max(6, ctx.window.hours * PRACTICAL_GROUND_SHARE);
  const usefulPoints = WEIGHTS.usefulHours * clamp01(usefulHours / practicalMax);
  factors.push({
    id: "usefulHours",
    label: "Useful time there",
    points: round(usefulPoints),
    max: WEIGHTS.usefulHours,
    detail: humaniseStay(verdict.nights, verdict.days),
  });

  // Headroom under the ceiling, not cheapness for its own sake. The ceiling comes
  // from the verdict because it has already been put into this offer's currency;
  // dividing a fare by a figure in another currency would be meaningless.
  const headroom =
    verdict.ceiling > 0 ? clamp01(1 - offer.totalPrice / verdict.ceiling) : 0;
  const budgetPoints = WEIGHTS.budgetFit * clamp01(0.5 + headroom * 1.2);
  factors.push({
    id: "budgetFit",
    label: "Budget headroom",
    points: round(budgetPoints),
    max: WEIGHTS.budgetFit,
    detail: `${Math.round(headroom * 100)}% under your maximum`,
  });

  // Fare against this route's own typical level.
  const ratio = dest ? offer.totalPrice / dest.baseFare : 1;
  const farePoints = WEIGHTS.fareValue * clamp01((1.25 - ratio) / 0.45);
  factors.push({
    id: "fareValue",
    label: "Fare value",
    points: round(farePoints),
    max: WEIGHTS.fareValue,
    detail:
      ratio <= 0.9
        ? `${Math.round((1 - ratio) * 100)}% below the usual fare`
        : ratio <= 1.05
          ? "In line with the usual fare"
          : "Above the usual fare",
  });

  // Dream list first, then a softer signal from stated interests.
  const dreamIndex = taste.dreamDestinations.findIndex(
    (d) => d.toLowerCase() === (dest?.city ?? "").toLowerCase(),
  );
  const dreamMatch = dreamIndex >= 0 ? 1 - dreamIndex * 0.07 : 0;

  // Interests are additive, never a substitute: a dream destination is already at
  // the ceiling, and a place nobody named cannot be lifted past one.
  const matchedInterests = (taste.interests as TasteTag[]).filter((tag) =>
    (dest?.tags ?? []).includes(tag),
  );
  const interestRatio = taste.interests.length
    ? matchedInterests.length / taste.interests.length
    : 0;
  const baseline = EXPLORATION_BASELINE[taste.spontaneity] ?? EXPLORATION_BASELINE.curious;
  const affinityPoints =
    WEIGHTS.affinity * clamp01((dreamMatch || baseline) + interestRatio * INTEREST_LIFT);
  factors.push({
    id: "affinity",
    label: "Destination affinity",
    points: round(affinityPoints),
    max: WEIGHTS.affinity,
    detail:
      dreamIndex >= 0
        ? "On your dream list"
        : matchedInterests.length > 0
          ? `Matches ${matchedInterests.join(" · ").toLowerCase()}`
          : "Outside your dream list",
  });

  const companionPoints = ctx.companionAvailable ? WEIGHTS.companion : 0;
  factors.push({
    id: "companion",
    label: "Companion match",
    points: companionPoints,
    max: WEIGHTS.companion,
    detail: ctx.companionAvailable ? "Both calendars fit" : "Travelling alone",
  });

  const legMinutes = minutesBetween(offer.outboundDepartureIso, offer.outboundArrivalIso);
  const conveniencePoints =
    WEIGHTS.convenience *
    clamp01((offer.stops === 0 ? 0.8 : 0.4) + clamp01(1 - legMinutes / taste.maxFlightMinutes) * 0.2);
  factors.push({
    id: "convenience",
    label: "Flight convenience",
    points: round(conveniencePoints),
    max: WEIGHTS.convenience,
    detail: offer.stops === 0 ? `Non-stop · ${Math.round(legMinutes / 60)}h` : `${offer.stops} stop`,
  });

  const safetyPoints =
    WEIGHTS.returnSafety * clamp01(verdict.returnBufferMinutes / (taste.returnBufferMinutes * 1.6));
  factors.push({
    id: "returnSafety",
    label: "Return safety",
    points: round(safetyPoints),
    max: WEIGHTS.returnSafety,
    detail: `~${Math.round(verdict.returnBufferMinutes / 60)}h before your next commitment`,
  });

  // Friction the traveller told us they dislike.
  let friction = 0;
  const frictionNotes: string[] = [];
  const departHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ctx.window.originAirport === "PEK" ? "Asia/Shanghai" : "Asia/Shanghai",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(offer.outboundDepartureIso)),
  );
  if (!taste.redEyeTolerated && (departHour >= 23 || departHour < 5)) {
    friction -= 4;
    frictionNotes.push("overnight departure");
  }
  if (taste.directPreferred && offer.stops > 0) {
    friction -= 3;
    frictionNotes.push("connection");
  }
  factors.push({
    id: "friction",
    label: "Friction",
    points: friction,
    max: -7,
    detail: frictionNotes.length ? frictionNotes.join(" · ") : "None",
  });

  const escapeScore = Math.max(
    0,
    Math.min(100, Math.round(factors.reduce((sum, f) => sum + f.points, 0))),
  );

  return {
    ...offer,
    usefulMinutes: verdict.usefulMinutes,
    returnBufferMinutes: verdict.returnBufferMinutes,
    escapeScore,
    factors,
    reasons: buildReasons(factors, ctx, verdict, dreamIndex >= 0),
    destinationName: dest?.city ?? offer.destination,
    destinationCountry: dest?.country ?? "",
    opportunityType: classify(ctx, dreamIndex >= 0, ratio),
    dreamMatch: dreamIndex >= 0 ? Math.round(dreamMatch * 100) : undefined,
    promise: dest?.promise ?? "",
  };
}

function buildReasons(
  factors: ScoreFactor[],
  ctx: ConstraintContext,
  verdict: ConstraintVerdict,
  onDreamList: boolean,
): string[] {
  const reasons: string[] = [];
  if (onDreamList) reasons.push("It has been on your dream list since you set it up.");
  const affinity = factors.find((f) => f.id === "affinity");
  if (!onDreamList && affinity?.detail.startsWith("Matches")) {
    reasons.push(`${affinity.detail} — the things you said you travel for.`);
  }
  if (ctx.companionAvailable) {
    reasons.push("Both calendars are genuinely free for the whole window.");
  }
  reasons.push(
    `${humaniseStay(verdict.nights, verdict.days)} on the ground, which is real time rather than travel time.`,
  );
  reasons.push(
    `You land back with about ${Math.round(
      verdict.returnBufferMinutes / 60,
    )} hours before your next commitment.`,
  );
  const fare = factors.find((f) => f.id === "fareValue");
  if (fare && fare.points > fare.max * 0.7) reasons.push(`The fare is ${fare.detail.toLowerCase()}.`);
  return reasons;
}

function classify(ctx: ConstraintContext, onDreamList: boolean, fareRatio: number): OpportunityType {
  if (fareRatio <= 0.78) return "price-match";
  if (onDreamList) return "dream-match";
  if (ctx.companionAvailable && ctx.window.companionIds.length > 0) return "shared-opening";
  if (ctx.window.hours >= 60) return "long-weekend";
  return "unexpected-escape";
}

export const OPPORTUNITY_LABEL: Record<OpportunityType, string> = {
  "unexpected-escape": "Unexpected escape",
  "shared-opening": "Shared opening",
  "dream-match": "Dream match",
  "price-match": "Price match",
  "long-weekend": "Long weekend",
  "milestone-match": "Milestone match",
  wildcard: "Wildcard",
};

/** The word shown under the number. Bands are fixed so the label never flatters. */
export function scoreBand(score: number): string {
  if (score >= 90) return "Exceptional";
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 60) return "Workable";
  return "Marginal";
}
