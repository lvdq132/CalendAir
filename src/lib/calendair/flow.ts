import type { AtlasAdapter } from "@/lib/atlas";
import { runOpportunityEngine } from "./engine";
import { activityEvent, pushActivity, type CalendarBlock, type Session } from "./store";
import { DESTINATION_BY_IATA } from "./destinations";
import { minutesBetween } from "./time";
import type { ScoredTrip, VerifiedOffer } from "./types";

/**
 * The booking flow, as a small explicit state machine.
 *
 * Two rules shape every function here.
 *
 *   The agent can be spontaneous. The transaction cannot be — search runs on its
 *   own, and every step after it waits for a person.
 *
 *   We re-read the world before every write, and we do not treat a successful
 *   HTTP response as a successful journey.
 */

export const MAX_REPLANS = Number(process.env.MAX_REPLANS ?? 2);

export async function scan(session: Session, atlas: AtlasAdapter) {
  session.booking.state = "SEARCHING";
  const result = await runOpportunityEngine(atlas, {
    window: session.world.window,
    taste: session.world.taste,
    companions: session.world.companions,
    nextCommitmentIso: session.world.nextCommitmentIso,
  });
  session.engine = result;
  pushActivity(session, ...result.activity);

  if (result.providerUnavailable) {
    // A provider outage and a genuine empty market are different facts and
    // must never produce the same state. SAFE_STOP means "we looked, and
    // nothing qualifies"; PROVIDER_UNAVAILABLE means "we don't know yet" —
    // see EngineResult.providerUnavailable / AtlasProviderUnavailableError.
    session.booking.state = "PROVIDER_UNAVAILABLE";
    pushActivity(
      session,
      activityEvent(
        "CALENDAIR",
        "Provider unavailable",
        "We couldn't reach the flight provider — this is not a statement about availability.",
        false,
      ),
    );
    return result;
  }

  session.booking.state = result.recommended ? "RECOMMENDATION_READY" : "SAFE_STOP";
  if (!result.recommended) {
    pushActivity(
      session,
      activityEvent(
        "CALENDAIR",
        "Safe stop",
        "Nothing cleared every hard constraint. Watching for a better opening.",
        false,
      ),
    );
  }
  return result;
}

export function tripById(session: Session, id: string): ScoredTrip | undefined {
  const e = session.engine;
  if (!e) return undefined;
  return [e.recommended, ...e.alternates].find((t): t is ScoredTrip => t?.id === id);
}

export type AuthorizeOutcome =
  | { kind: "confirmed"; total: number; currency: string }
  | { kind: "price-changed"; previous: number; current: number; currency: string }
  | { kind: "unavailable"; replacement?: ScoredTrip }
  | { kind: "safe-stop"; reason: string };

/**
 * FR-007 + FR-008 — the traveller authorises, then the world is re-read.
 *
 * Nothing has been written at this point. If the fare moved, the flow stops and
 * waits for an explicit acceptance rather than absorbing the difference.
 */
export async function authorize(
  session: Session,
  atlas: AtlasAdapter,
  tripId: string,
): Promise<AuthorizeOutcome> {
  const trip = tripById(session, tripId);
  if (!trip) return { kind: "safe-stop", reason: "That offer is no longer in the current search." };
  if (trip.referenceOnly) {
    return { kind: "safe-stop", reason: "A reference price cannot be verified or booked." };
  }

  session.booking.tripId = tripId;
  session.booking.state = "USER_AUTHORIZED";
  pushActivity(
    session,
    activityEvent("CALENDAIR", "Traveller authorised", `${trip.destinationName} · awaiting live recheck`),
  );

  return reverify(session, atlas, trip.totalPrice);
}

/**
 * Re-read the world, then hand the result back to a person.
 *
 * Deliberately not a loop that keeps going until it finds something: when the
 * fare has gone, the replacement is a different trip, and substituting one for
 * another without asking is exactly the kind of confident improvisation this
 * product exists not to do. The replan budget is still enforced here.
 */
async function reverify(
  session: Session,
  atlas: AtlasAdapter,
  displayedTotal: number,
): Promise<AuthorizeOutcome> {
  const tripId = session.booking.tripId;
  const trip = tripId ? tripById(session, tripId) : undefined;
  if (!trip) return safeStop(session, "No candidate left to verify.");

  session.booking.state = "REVERIFYING";
  const started = Date.now();
  let current: VerifiedOffer;
  try {
    current = await atlas.verifyOffer(trip.id);
  } catch (err) {
    // Verification can fail for reasons that are not "the fare is gone" —
    // ticketing entitlement blocked (SUBSCRIPTION_REQUIRED in skill mode), or
    // in hybrid mode a live offer id the demo ticketing adapter was never
    // going to recognise (see HybridAtlasAdapter.verifyOffer). Either way we
    // do not fabricate a verified price and we do not crash the checkpoint —
    // report the real reason and stop for a human decision.
    const detail = err instanceof Error ? err.message : "This fare could not be verified.";
    pushActivity(
      session,
      activityEvent("ATLAS", "Rechecking live fare", detail, false, Date.now() - started),
    );
    return safeStop(session, detail);
  }
  pushActivity(
    session,
    activityEvent(
      "ATLAS",
      "Rechecking live fare",
      `${trip.destinationName} · ${current.bookable ? "available" : "no longer available"}`,
      current.bookable,
      Date.now() - started,
    ),
  );

  if (current.bookable && current.totalPrice === displayedTotal) {
    session.booking.verified = current;
    session.booking.approvedTotal = current.totalPrice;
    session.booking.approvedCurrency = current.currency;
    session.booking.previousTotal = undefined;
    session.booking.state = "PRICE_CONFIRMED";
    return { kind: "confirmed", total: current.totalPrice, currency: current.currency };
  }

  if (current.bookable) {
    session.booking.verified = current;
    session.booking.previousTotal = displayedTotal;
    session.booking.state = "PRICE_CHANGED";
    pushActivity(
      session,
      activityEvent(
        "CALENDAIR",
        "Price changed",
        `${current.currency} ${displayedTotal} → ${current.totalPrice} · waiting for the traveller`,
        false,
      ),
    );
    return {
      kind: "price-changed",
      previous: displayedTotal,
      current: current.totalPrice,
      currency: current.currency,
    };
  }

  // Gone. Replan once, within budget, and stop for a decision.
  session.booking.replans += 1;
  session.booking.state = "SOLD_OUT";

  if (session.booking.replans > MAX_REPLANS) {
    return safeStop(
      session,
      `The replan limit of ${MAX_REPLANS} was reached. Nothing was booked and the window stays open.`,
    );
  }

  const replacement = nextBestCandidate(session, trip.id);
  pushActivity(
    session,
    activityEvent(
      "CALENDAIR",
      `Replanning (${session.booking.replans} of ${MAX_REPLANS})`,
      replacement
        ? `${replacement.destinationName} still clears every hard constraint · waiting for the traveller`
        : "No replacement cleared every hard constraint",
      Boolean(replacement),
    ),
  );

  if (!replacement) {
    return safeStop(session, "No replacement cleared every hard constraint.");
  }

  return { kind: "unavailable", replacement };
}

function nextBestCandidate(session: Session, excludeId: string): ScoredTrip | undefined {
  const e = session.engine;
  if (!e) return undefined;
  return [e.recommended, ...e.alternates]
    .filter((t): t is ScoredTrip => Boolean(t) && t!.id !== excludeId && t!.bookable)
    .sort((a, b) => b.escapeScore - a.escapeScore)[0];
}

function safeStop(session: Session, reason: string): AuthorizeOutcome {
  session.booking.state = "SAFE_STOP";
  pushActivity(session, activityEvent("CALENDAIR", "Safe stop", reason, false));
  return { kind: "safe-stop", reason };
}

/** The traveller explicitly accepts the new total. Only then does the flow continue. */
export function acceptPrice(session: Session): AuthorizeOutcome {
  const v = session.booking.verified;
  if (!v || session.booking.state !== "PRICE_CHANGED") {
    return { kind: "safe-stop", reason: "There is no price change waiting for a decision." };
  }
  session.booking.approvedTotal = v.totalPrice;
  session.booking.approvedCurrency = v.currency;
  session.booking.state = "PRICE_CONFIRMED";
  pushActivity(
    session,
    activityEvent(
      "CALENDAIR",
      "New price accepted",
      `${v.currency} ${v.totalPrice} approved by the traveller`,
    ),
  );
  return { kind: "confirmed", total: v.totalPrice, currency: v.currency };
}

/**
 * FR-010 — create the booking, then find out what actually happened.
 *
 * The provider returning a reference is not a journey. The session stays in
 * BOOKING_PENDING until the provider reports a confirmed state of its own.
 */
export async function book(session: Session, atlas: AtlasAdapter) {
  const v = session.booking.verified;
  if (!v || session.booking.state !== "PRICE_CONFIRMED") {
    return { ok: false as const, reason: "The fare has not been confirmed for this exact total." };
  }
  if (v.totalPrice !== session.booking.approvedTotal) {
    return { ok: false as const, reason: "The approved total no longer matches the verified fare." };
  }

  session.booking.state = "BOOKING_CREATING";
  const result = await atlas.createBooking({
    offer: v,
    passengerProfileId: session.world.passenger.id,
    passenger: session.world.passenger,
    approvedTotal: session.booking.approvedTotal!,
    approvedCurrency: session.booking.approvedCurrency!,
  });
  session.booking.result = result;
  session.booking.reference = result.reference;
  session.booking.state = result.state === "failed" ? "BOOKING_FAILED" : "BOOKING_PENDING";

  pushActivity(
    session,
    activityEvent(
      "ATLAS",
      result.state === "failed" ? "Booking rejected" : "Booking requested",
      result.rawStatusLabel ?? result.state,
      result.state !== "failed",
    ),
  );
  return { ok: true as const, result };
}

/** Poll the provider until it reports its own confirmed state, then write the calendar. */
export async function pollFulfilment(session: Session, atlas: AtlasAdapter) {
  const ref = session.booking.reference;
  if (!ref) return { state: session.booking.state, result: session.booking.result };

  const result = await atlas.getBookingStatus(ref);
  session.booking.result = result;

  if (result.state === "confirmed" && session.booking.state !== "COMPLETE") {
    session.booking.state = "FULFILMENT_CONFIRMED";
    pushActivity(
      session,
      activityEvent("ATLAS", "Fulfilment confirmed", result.rawStatusLabel ?? "Ticket issued"),
    );
    session.booking.calendarBlocks = writeCalendar(session);
    session.booking.state = "CALENDAR_UPDATED";
    pushActivity(
      session,
      activityEvent(
        "CALENDAR",
        "Calendar updated",
        `${session.booking.calendarBlocks.length} blocks written after confirmation`,
      ),
    );
    session.booking.state = "COMPLETE";
  } else if (result.state === "failed") {
    session.booking.state = "BOOKING_FAILED";
  }

  return { state: session.booking.state, result };
}

/**
 * FR-011 — calendar write-back, and only after fulfilment.
 *
 * A trip that is still ticketing gets nothing on the calendar. Writing a
 * confident block before the airline agrees is how people miss real meetings.
 */
function writeCalendar(session: Session): CalendarBlock[] {
  const v = session.booking.verified;
  if (!v || !v.returnDepartureIso || !v.returnArrivalIso) return [];
  const dest = DESTINATION_BY_IATA[v.destination];
  const city = dest?.city ?? v.destination;
  const tentative = session.booking.result?.state !== "confirmed";

  const bufferEnd = new Date(
    Date.parse(v.returnArrivalIso) + session.world.taste.returnBufferMinutes * 60_000,
  ).toISOString();

  // Each end of a block is read in the local time of the airport it happens at,
  // so a red-eye never appears to arrive before it left.
  return [
    {
      id: "cal-out",
      kind: "outbound",
      title: `Flight ${v.origin} → ${v.destination}`,
      startIso: v.outboundDepartureIso,
      endIso: v.outboundArrivalIso,
      startAt: v.origin,
      endAt: v.destination,
      tentative,
    },
    {
      id: "cal-stay",
      kind: "destination",
      title: city,
      startIso: v.outboundArrivalIso,
      endIso: v.returnDepartureIso,
      startAt: v.destination,
      endAt: v.destination,
      tentative,
    },
    {
      id: "cal-back",
      kind: "return",
      title: `Flight ${v.destination} → ${v.origin}`,
      startIso: v.returnDepartureIso,
      endIso: v.returnArrivalIso,
      startAt: v.destination,
      endAt: v.origin,
      tentative,
    },
    {
      id: "cal-buffer",
      kind: "buffer",
      title: "Recovery buffer",
      startIso: v.returnArrivalIso,
      endIso: bufferEnd,
      startAt: v.origin,
      endAt: v.origin,
      tentative,
    },
  ];
}

/** Minutes of the traveller's window each written block occupies, for the before/after view. */
export function calendarSpanMinutes(blocks: CalendarBlock[]): number {
  if (blocks.length === 0) return 0;
  return minutesBetween(blocks[0].startIso, blocks[blocks.length - 1].endIso);
}
