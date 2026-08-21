import type { AtlasAdapter } from "./adapter";
import type {
  AtlasAccountStatus,
  BookingInput,
  BookingResult,
  DemoScenario,
  FlightSearchInput,
  NormalizedOffer,
  VerifiedOffer,
} from "@/lib/calendair/types";
import { buildDemoWorld } from "@/lib/calendair/demo/world";
import { demoOffers, demoReverification } from "@/lib/calendair/demo/inventory";

/**
 * The deterministic adapter used for stage reliability.
 *
 * It answers the same interface as a live Atlas client and labels itself as
 * demo inventory on every status call, so the badge in the UI can never claim
 * otherwise. Prices move only where the chosen scenario says the world moved.
 */
/** A short, stable, human-readable suffix — the same offer always reads the same. */
function shortCode(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase().slice(0, 4).padStart(4, "0");
}

export class DemoAtlasAdapter implements AtlasAdapter {
  private bookings = new Map<string, { result: BookingResult; createdAt: number }>();

  constructor(private readonly scenario: DemoScenario) {}

  async getStatus(): Promise<AtlasAccountStatus> {
    return {
      authorized: true,
      ticketingAvailable: true,
      environment: "sandbox",
      adapter: "demo",
      label: "Demo inventory · not live Atlas data",
    };
  }

  private offersFor(input: FlightSearchInput): NormalizedOffer[] {
    const world = buildDemoWorld(new Date(Date.parse(input.departureAfter)), this.scenario);
    // The search window comes from the caller, so the schedule always lines up
    // with the opening the engine detected rather than with a fixed calendar.
    const window = {
      ...world.window,
      startIso: input.departureAfter,
      endIso: input.returnBefore,
      originAirport: input.origin,
    };
    return demoOffers(window, this.scenario);
  }

  async searchFlights(input: FlightSearchInput): Promise<NormalizedOffer[]> {
    return this.offersFor(input);
  }

  async verifyOffer(offerId: string): Promise<VerifiedOffer> {
    // A verification always re-reads; it never trusts what the caller is holding.
    const world = buildDemoWorld(new Date(), this.scenario);
    const fresh = demoOffers(world.window, this.scenario).find((o) => o.id === offerId);
    if (!fresh) {
      throw new Error(`Offer ${offerId} is no longer present in the current search.`);
    }
    return { ...demoReverification(fresh, this.scenario), verifiedAtIso: new Date().toISOString() };
  }

  async createBooking(input: BookingInput): Promise<BookingResult> {
    if (input.offer.referenceOnly || !input.offer.bookable) {
      return {
        state: "failed",
        testMode: true,
        rawStatusLabel: "Offer is not bookable",
      };
    }
    const reference = `CDA-${input.offer.destination}${shortCode(input.offer.id)}`;
    // Booking is never instantly confirmed: the caller has to ask the provider
    // what actually happened, which is the point of the false-success guard.
    const result: BookingResult = {
      reference,
      state: "pending",
      testMode: true,
      rawStatusLabel: "Booking requested · awaiting ticketing",
    };
    this.bookings.set(reference, { result, createdAt: Date.now() });
    return result;
  }

  async getBookingStatus(reference: string): Promise<BookingResult> {
    const held = this.bookings.get(reference);
    if (!held) return { reference, state: "failed", testMode: true, rawStatusLabel: "Unknown reference" };

    // The `pending` scenario is the one where ticketing genuinely stays open.
    if (this.scenario === "pending") {
      return { ...held.result, rawStatusLabel: "Awaiting airline confirmation" };
    }

    const elapsed = Date.now() - held.createdAt;
    if (elapsed < 2600) {
      return { ...held.result, rawStatusLabel: "Ticketing in progress" };
    }

    return {
      reference,
      state: "confirmed",
      testMode: true,
      rawStatusLabel: "Sandbox ticket issued",
      pnr: `X${reference.slice(-5)}`,
      ticketNumber: `999-${reference.slice(-7).replace(/\D/g, "0").padStart(7, "0")}`,
    };
  }
}
