import { DESTINATION_BY_IATA } from "./destinations";
import { convertAmount } from "./money";
import type { NormalizedOffer, RejectedCandidate, TravelTaste, DetectedWindow } from "./types";
import { minutesBetween, usefulTimeAtDestination } from "./time";

/**
 * FR-004 — safety constraints and scored preferences.
 *
 * These are pass/fail, evaluated in code, and no score can overturn them. A
 * language model is never consulted here: a model that decides a budget is
 * "close enough" produces a trip the traveller cannot afford, and a model that
 * rounds a return time produces one they cannot make. Comfort preferences are
 * recorded on a passing verdict so scoring can penalise them without pretending
 * that a safe, bookable itinerary does not exist.
 */

export interface ConstraintContext {
  window: DetectedWindow;
  taste: TravelTaste;
  /** When the traveller's next commitment starts, for the return buffer. */
  nextCommitmentIso: string;
  companionAvailable: boolean;
}

export interface ConstraintVerdict {
  ok: boolean;
  usefulMinutes: number;
  nights: number;
  days: number;
  returnBufferMinutes: number;
  /**
   * The traveller's spending ceiling, expressed in this offer's currency.
   *
   * Converted once here and carried, so scoring cannot reach for the raw figure
   * and compare two different units by accident.
   */
  ceiling: number;
  /** Preferences this safe offer misses. These lower rank; they never waive safety. */
  preferenceMisses: PreferenceMiss[];
  rejection?: RejectedCandidate;
}

export interface PreferenceMiss {
  id: "usefulHours" | "flightDuration" | "stops";
  label: string;
  detail: string;
}

const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function checkHardConstraints(
  offer: NormalizedOffer,
  ctx: ConstraintContext,
): ConstraintVerdict {
  const dest = DESTINATION_BY_IATA[offer.destination];
  const destinationName = dest?.city ?? offer.destination;
  const reject = (rule: string, detail: string): ConstraintVerdict => ({
    ok: false,
    usefulMinutes: 0,
    nights: 0,
    days: 0,
    returnBufferMinutes: 0,
    ceiling: 0,
    preferenceMisses: [],
    rejection: { offerId: offer.id, destinationName, rule, detail },
  });

  if (!offer.returnDepartureIso || !offer.returnArrivalIso) {
    return reject("Incomplete itinerary", "No return leg was offered inside the window.");
  }

  // Leaves before the window opens.
  if (minutesBetween(ctx.window.startIso, offer.outboundDepartureIso) < 0) {
    return reject("Departs too early", "It leaves before your calendar actually frees up.");
  }

  // Lands home after the window closes.
  const overrun = minutesBetween(ctx.window.endIso, offer.returnArrivalIso);
  if (overrun > 0) {
    return reject(
      "Returns too late",
      `It lands ${Math.round(overrun / 60)}h after your next commitment starts.`,
    );
  }

  const buffer = minutesBetween(offer.returnArrivalIso, ctx.nextCommitmentIso);
  if (buffer < ctx.taste.returnBufferMinutes) {
    return reject(
      "Return buffer too tight",
      `Only ${Math.round(buffer / 60)}h before your next commitment; you asked for ${Math.round(
        ctx.taste.returnBufferMinutes / 60,
      )}h.`,
    );
  }

  // The ceiling has to be expressed in the currency the fare is quoted in before
  // the two can be compared at all. An unknown pair is refused rather than
  // guessed: a budget rule that compares mismatched units is not a rule.
  const ceiling = convertAmount(
    ctx.taste.maxSpontaneousSpend,
    ctx.taste.currency,
    offer.currency,
  );
  if (ceiling === null) {
    return reject(
      "Budget not comparable",
      `This fare is quoted in ${offer.currency} and your maximum is set in ${ctx.taste.currency}; the two cannot be compared safely.`,
    );
  }
  if (offer.totalPrice > ceiling) {
    return reject(
      "Over your budget",
      `${money(offer.totalPrice, offer.currency)} against a hard maximum of ${money(
        ctx.taste.maxSpontaneousSpend,
        ctx.taste.currency,
      )}.`,
    );
  }

  // Bookability is provider truth, not a taste. A reference or withdrawn fare
  // cannot enter a flow that promises a fresh verification before purchase.
  if (!offer.bookable || offer.referenceOnly) {
    return reject(
      offer.referenceOnly ? "Reference price only" : "Offer not bookable",
      offer.referenceOnly
        ? "This fare is for comparison and cannot be verified or booked."
        : "The provider marked this itinerary as unavailable for booking.",
    );
  }

  const stay = usefulTimeAtDestination(
    offer.outboundArrivalIso,
    offer.returnDepartureIso,
    dest?.zone ?? "UTC",
  );
  const preferenceMisses: PreferenceMiss[] = [];
  if (stay.usefulMinutes < ctx.taste.minUsefulHours * 60) {
    preferenceMisses.push({
      id: "usefulHours",
      label: "Shorter stay",
      detail: `${Math.round(stay.usefulMinutes / 60)}h on the ground versus ${ctx.taste.minUsefulHours}h preferred.`,
    });
  }

  const legMinutes = minutesBetween(offer.outboundDepartureIso, offer.outboundArrivalIso);
  if (legMinutes > ctx.taste.maxFlightMinutes) {
    preferenceMisses.push({
      id: "flightDuration",
      label: "Longer flight",
      detail: `${Math.round(legMinutes / 60)}h each way versus ${Math.round(ctx.taste.maxFlightMinutes / 60)}h preferred.`,
    });
  }

  if (offer.stops > ctx.taste.maxStops) {
    preferenceMisses.push({
      id: "stops",
      label: "Extra connection",
      detail: `${offer.stops} stops versus ${ctx.taste.maxStops} preferred.`,
    });
  }

  if (!ctx.companionAvailable && ctx.window.companionIds.length > 0) {
    return reject("Companion not free", "Your companion has a conflict inside this window.");
  }

  return {
    ok: true,
    usefulMinutes: stay.usefulMinutes,
    nights: stay.nights,
    days: stay.days,
    returnBufferMinutes: buffer,
    ceiling,
    preferenceMisses,
  };
}
