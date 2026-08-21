import { describe, expect, it } from "vitest";
import { createSession } from "./store";
import { scan, authorize, book } from "./flow";
import { DemoAtlasAdapter } from "@/lib/atlas/demo-adapter";
import { AtlasProviderUnavailableError } from "@/lib/atlas/adapter";
import type { AtlasAdapter } from "@/lib/atlas/adapter";
import type { VerifiedOffer } from "./types";

/**
 * flow.ts's reverify() catch — the exact bug FIX 1 in the tonight's review
 * addresses: a provider outage at reverify ("Atlas didn't answer, even
 * after retrying") must produce PROVIDER_UNAVAILABLE, never the same
 * SAFE_STOP the UI reads as "the agent looked and deliberately stopped".
 * A genuine terminal refusal (the fare really is gone / blocked) must still
 * safe-stop, with its real reason.
 *
 * These tests drive flow.ts directly against a hand-built fake AtlasAdapter,
 * bypassing the HTTP route layer and the ATLAS_INTEGRATION_MODE factory, so
 * they exercise exactly the branch under test regardless of which adapter is
 * configured in this environment.
 */

/** Build a real session with a real, scored recommended trip via the deterministic demo adapter. */
async function sessionWithRecommendation() {
  const session = createSession("perfect");
  const result = await scan(session, new DemoAtlasAdapter("perfect"));
  const trip = result.recommended;
  if (!trip) throw new Error("test setup: demo scenario 'perfect' did not produce a recommendation");
  return { session, trip };
}

function stubAtlas(overrides: Partial<AtlasAdapter>): AtlasAdapter {
  return {
    getStatus: async () => {
      throw new Error("not used in this test");
    },
    searchFlights: async () => {
      throw new Error("not used in this test");
    },
    verifyOffer: async () => {
      throw new Error("not used in this test");
    },
    createBooking: async () => {
      throw new Error("not used in this test");
    },
    getBookingStatus: async () => {
      throw new Error("not used in this test");
    },
    ...overrides,
  };
}

describe("flow.authorize / reverify — FIX 1: provider outage vs. terminal refusal at reverify", () => {
  it("a retryable-exhausted verify reports PROVIDER_UNAVAILABLE, not SAFE_STOP", async () => {
    const { session, trip } = await sessionWithRecommendation();
    const atlas = stubAtlas({
      verifyOffer: async () => {
        throw new AtlasProviderUnavailableError(
          "SERVICE_TEMPORARILY_UNAVAILABLE: Flight search temporarily unavailable",
        );
      },
    });

    const outcome = await authorize(session, atlas, trip.id);

    expect(outcome.kind).toBe("provider-unavailable");
    expect(session.booking.state).toBe("PROVIDER_UNAVAILABLE");
    // Must not be reported as a considered, deliberate stop.
    expect(session.booking.state).not.toBe("SAFE_STOP");
  });

  it("a terminal verify error (e.g. SUBSCRIPTION_REQUIRED) still safe-stops, with its real reason", async () => {
    const { session, trip } = await sessionWithRecommendation();
    const atlas = stubAtlas({
      verifyOffer: async () => {
        throw new Error("SUBSCRIPTION_REQUIRED: Ticketing is not active for this account");
      },
    });

    const outcome = await authorize(session, atlas, trip.id);

    expect(outcome.kind).toBe("safe-stop");
    expect(session.booking.state).toBe("SAFE_STOP");
    expect(outcome.kind === "safe-stop" && outcome.reason).toMatch(/SUBSCRIPTION_REQUIRED/);
  });

  it("a bookable, unchanged fare still confirms normally (control case)", async () => {
    const { session, trip } = await sessionWithRecommendation();
    const verified: VerifiedOffer = {
      ...trip,
      bookable: true,
      totalPrice: trip.totalPrice,
      verifiedAtIso: new Date().toISOString(),
    };
    const atlas = stubAtlas({ verifyOffer: async () => verified });

    const outcome = await authorize(session, atlas, trip.id);

    expect(outcome.kind).toBe("confirmed");
    expect(session.booking.state).toBe("PRICE_CONFIRMED");
  });
});

describe("flow.book — FIX 3: an unanswered order create is an unknown outcome, not a claimed failure", () => {
  it("createBooking throwing (e.g. runCliWithStdin's 60s timeout with no parseable reply) reports BOOKING_OUTCOME_UNKNOWN, not BOOKING_FAILED, and invents no reference", async () => {
    const { session, trip } = await sessionWithRecommendation();
    const confirmed: VerifiedOffer = {
      ...trip,
      bookable: true,
      totalPrice: trip.totalPrice,
      verifiedAtIso: new Date().toISOString(),
    };
    await authorize(session, stubAtlas({ verifyOffer: async () => confirmed }), trip.id);
    expect(session.booking.state).toBe("PRICE_CONFIRMED");

    const outcome = await book(
      session,
      stubAtlas({
        createBooking: async () => {
          throw new Error("Atlas CLI failed: no output received");
        },
      }),
    );

    expect(outcome.ok).toBe(false);
    expect(session.booking.state).toBe("BOOKING_OUTCOME_UNKNOWN");
    expect(session.booking.state).not.toBe("BOOKING_FAILED");
    expect(session.booking.reference).toBeUndefined();
  });
});
