import { DESTINATION_BY_IATA } from "./destinations";
import { convertAmount } from "./money";
import type { NormalizedOffer, RejectedCandidate, TravelTaste, DetectedWindow } from "./types";
import { minutesBetween, usefulTimeAtDestination } from "./time";

/**
 * FR-004 — hard constraints.
 *
 * These are pass/fail, evaluated in code, and no score can overturn them. A
 * language model is never consulted here: a model that decides a budget is
 * "close enough" produces a trip the traveller cannot afford, and a model that
 * rounds a return time produces one they cannot make.
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
  rejection?: RejectedCandidate;
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

  const stay = usefulTimeAtDestination(
    offer.outboundArrivalIso,
    offer.returnDepartureIso,
    dest?.zone ?? "UTC",
  );
  if (stay.usefulMinutes < ctx.taste.minUsefulHours * 60) {
    return reject(
      "Not enough time there",
      `${Math.round(stay.usefulMinutes / 60)}h on the ground against a minimum of ${
        ctx.taste.minUsefulHours
      }h.`,
    );
  }

  const legMinutes = minutesBetween(offer.outboundDepartureIso, offer.outboundArrivalIso);
  if (legMinutes > ctx.taste.maxFlightMinutes) {
    return reject(
      "Flight too long",
      `${Math.round(legMinutes / 60)}h each way against a tolerance of ${Math.round(
        ctx.taste.maxFlightMinutes / 60,
      )}h.`,
    );
  }

  if (offer.stops > ctx.taste.maxStops) {
    return reject(
      "Too many connections",
      `${offer.stops} stops against a tolerance of ${ctx.taste.maxStops}.`,
    );
  }

  if (!ctx.companionAvailable && ctx.window.companionIds.length > 0) {
    return reject("Companion not free", "Your companion has a conflict inside this window.");
  }

  // A reference price is comparison-only and must never reach a booking flow.
  if (offer.referenceOnly) {
    return reject(
      "Reference price only",
      "This fare is for comparison and cannot be verified or booked.",
    );
  }

  return {
    ok: true,
    usefulMinutes: stay.usefulMinutes,
    nights: stay.nights,
    days: stay.days,
    returnBufferMinutes: buffer,
    ceiling,
  };
}
