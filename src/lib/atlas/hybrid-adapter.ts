import type { AtlasAdapter } from "./adapter";
import { SkillAtlasAdapter } from "./skill-adapter";
import { DemoAtlasAdapter } from "./demo-adapter";
import type {
  AtlasAccountStatus,
  BookingInput,
  BookingResult,
  DemoScenario,
  FlightSearchInput,
  NormalizedOffer,
  VerifiedOffer,
} from "@/lib/calendair/types";

/**
 * HybridAtlasAdapter — live Atlas search, demo transaction.
 *
 * Why this exists: the account's Atlas ticketing capability is blocked
 * (`SUBSCRIPTION_REQUIRED` / `TICKETING_ACTIVATION_REQUIRED`), which makes
 * pure "skill" mode dead-end at `verifyOffer` — but flight *search* genuinely
 * works against real inventory. Pure demo mode throws that away entirely.
 * This adapter is neither extreme: it composes the two existing adapters
 * rather than duplicating either one, and answers each of the five
 * AtlasAdapter methods from whichever backend can honestly answer it.
 *
 *   searchFlights                    → SkillAtlasAdapter (live)
 *   verifyOffer / createBooking /
 *   getBookingStatus                 → DemoAtlasAdapter (demo)
 *
 * Two deliberate design decisions, both required by the "never present demo
 * as live" rule in AGENTS.md:
 *
 * 1. No demo fallback on a failed live search. When SkillAtlasAdapter.search
 *    Flights cannot reach the provider, it throws AtlasProviderUnavailableError
 *    (see adapter.ts / skill-adapter.ts) — this adapter lets that propagate
 *    unchanged rather than quietly substituting demo offers labelled as live
 *    ones. Tasks 1+2 already give the booking flow an honest way to say "we
 *    couldn't reach the provider" (BookingState "PROVIDER_UNAVAILABLE")
 *    without ever needing demo data to impersonate a live answer. Since
 *    there is no fallback, there is nothing to silently swap.
 *
 * 2. verifyOffer on a live offer id, against demo ticketing — semantics.
 *    Every offer id reaching verifyOffer in hybrid mode came from a LIVE
 *    Atlas search, so it will never exist in DemoAtlasAdapter's fixed
 *    inventory (ids like "atl-dxb-nonstop"). That is not a bug to route
 *    around: it is the honest fact that Atlas ticketing itself is blocked
 *    for this account, so *no* backend — live or demo — can actually verify
 *    this specific fare right now. We do not (a) crash, (b) reinterpret the
 *    demo adapter's "offer not found" message as if the fare had expired, or
 *    (c) fabricate a "verified" result from the live offer's cached
 *    price/segments — that would present an unchecked number as a checked
 *    one, which is exactly the false-success failure mode this product
 *    exists to prevent. Instead we catch the demo adapter's not-found error
 *    and re-throw a clear, specific one. flow.ts's reverify() already
 *    catches any verifyOffer throw and turns it into a safe stop with the
 *    thrown message as the reason, so this surfaces to the traveller as an
 *    honest, readable explanation rather than an unhandled exception.
 */
export class HybridAtlasAdapter implements AtlasAdapter {
  private readonly live: SkillAtlasAdapter;
  private readonly demo: DemoAtlasAdapter;

  constructor(environment: "sandbox" | "production" | "unknown", scenario: DemoScenario = "perfect") {
    this.live = new SkillAtlasAdapter(environment);
    this.demo = new DemoAtlasAdapter(scenario);
  }

  async getStatus(): Promise<AtlasAccountStatus> {
    const live = await this.live.getStatus();
    return {
      authorized: live.authorized,
      // Ticketing here is always answered by the demo adapter, by design —
      // never report a live capability this instance does not actually have,
      // even though the underlying live adapter might itself be authorized.
      ticketingAvailable: false,
      environment: live.environment,
      adapter: "hybrid",
      label: live.authorized
        ? "Atlas Hybrid · live search, demo ticketing"
        : "Atlas Hybrid · search not authorized, demo ticketing",
      provenance: { search: "live", ticketing: "demo" },
    };
  }

  async searchFlights(input: FlightSearchInput): Promise<NormalizedOffer[]> {
    // Live only. See file header, decision 1: no silent demo fallback.
    return this.live.searchFlights(input);
  }

  async verifyOffer(offerId: string): Promise<VerifiedOffer> {
    try {
      return await this.demo.verifyOffer(offerId);
    } catch {
      // See file header, decision 2. Deliberately not a passthrough of the
      // demo adapter's error message — that message ("no longer present in
      // the current search") describes a different situation than this one.
      throw new Error(
        `This fare can't be verified yet: Atlas ticketing is not active for this account ` +
          `(TICKETING_ACTIVATION_REQUIRED). Live search works in hybrid mode, but confirming or ` +
          `booking a specific fare requires ticketing activation at ` +
          `https://www.atriptech.com/#/workspace. [offer ${offerId}]`,
      );
    }
  }

  async createBooking(input: BookingInput): Promise<BookingResult> {
    return this.demo.createBooking(input);
  }

  async getBookingStatus(reference: string): Promise<BookingResult> {
    return this.demo.getBookingStatus(reference);
  }
}
