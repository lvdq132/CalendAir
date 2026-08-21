import type {
  AtlasAccountStatus,
  BookingInput,
  BookingResult,
  FlightSearchInput,
  NormalizedOffer,
  VerifiedOffer,
} from "@/lib/calendair/types";

/**
 * The whole travel provider, behind one interface.
 *
 * Nothing above this line knows how Atlas is reached. That matters for more than
 * tidiness: the hackathon account may be wired through the Atlas Flight Booking
 * Skill or through ATRIP, and the adapter is where that decision lives.
 *
 * Deliberately not implemented here: guessed REST endpoints, auth headers or
 * ticketing payloads. Those must be read from the installed Skill or the
 * official ATRIP documentation for the account, then written into a real
 * adapter. An invented endpoint that returns a plausible object is worse than no
 * integration at all, because it looks like it works.
 */
export interface AtlasAdapter {
  getStatus(): Promise<AtlasAccountStatus>;
  searchFlights(input: FlightSearchInput): Promise<NormalizedOffer[]>;
  verifyOffer(offerId: string): Promise<VerifiedOffer>;
  createBooking(input: BookingInput): Promise<BookingResult>;
  getBookingStatus(reference: string): Promise<BookingResult>;
}

export class AtlasNotWiredError extends Error {
  constructor(operation: string, mode: string) {
    super(
      `Atlas is configured as "${mode}" but the adapter for it has not been written. ` +
        `Implement ${operation}() against the installed Atlas Flight Booking Skill or the ` +
        `ATRIP interface issued to this account. This build will not substitute demo data ` +
        `for a live call.`,
    );
    this.name = "AtlasNotWiredError";
  }
}

/**
 * A live-mode placeholder that refuses rather than pretends.
 *
 * If someone sets ATLAS_INTEGRATION_MODE without wiring the real client, every
 * call fails loudly and the badge in the UI says so. Silence here is how a demo
 * ends up claiming a Sandbox ticket is a real booking.
 */
export class UnwiredAtlasAdapter implements AtlasAdapter {
  constructor(
    private readonly mode: "skill" | "atrip",
    private readonly environment: "sandbox" | "production" | "unknown",
  ) {}

  async getStatus(): Promise<AtlasAccountStatus> {
    return {
      authorized: false,
      ticketingAvailable: false,
      environment: this.environment,
      adapter: this.mode,
      label: `Atlas ${this.mode.toUpperCase()} selected · adapter not wired`,
    };
  }

  async searchFlights(): Promise<NormalizedOffer[]> {
    throw new AtlasNotWiredError("searchFlights", this.mode);
  }
  async verifyOffer(): Promise<VerifiedOffer> {
    throw new AtlasNotWiredError("verifyOffer", this.mode);
  }
  async createBooking(): Promise<BookingResult> {
    throw new AtlasNotWiredError("createBooking", this.mode);
  }
  async getBookingStatus(): Promise<BookingResult> {
    throw new AtlasNotWiredError("getBookingStatus", this.mode);
  }
}
