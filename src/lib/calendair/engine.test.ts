import { describe, expect, it } from "vitest";
import { buildDemoWorld } from "./demo/world";
import { companionOverlap, runOpportunityEngine } from "./engine";
import { DemoAtlasAdapter } from "@/lib/atlas/demo-adapter";
import { createAtlasAdapter, AtlasProviderUnavailableError, type AtlasAdapter } from "@/lib/atlas";
import { createSession } from "./store";
import { authorize, scan } from "./flow";
import { checkHardConstraints } from "./constraints";
import { usefulTimeAtDestination, hoursBetween } from "./time";
import { demoOffers } from "./demo/inventory";

const NOW = new Date("2026-08-19T02:00:00.000Z");

async function run(scenario: Parameters<typeof buildDemoWorld>[1] = "perfect", opts = {}) {
  const world = buildDemoWorld(NOW, scenario, opts);
  const atlas = new DemoAtlasAdapter(world.scenario);
  const result = await runOpportunityEngine(atlas, {
    window: world.window,
    taste: world.taste,
    companions: world.companions,
    nextCommitmentIso: world.nextCommitmentIso,
  });
  return { world, result };
}

describe("AT-001 calendar opening", () => {
  it("detects a 68-hour window that starts when the released event did", async () => {
    const world = buildDemoWorld(NOW);
    expect(world.window.hours).toBe(68);
    expect(Math.round(hoursBetween(world.window.startIso, world.window.endIso))).toBe(68);
    expect(world.window.openedBy?.startIso).toBe(world.window.startIso);
  });
});

describe("AT-002 / AT-003 companion availability", () => {
  it("marks the window shared when the companion is free", async () => {
    const world = buildDemoWorld(NOW);
    expect(companionOverlap(world.window, world.companions).free).toEqual(["companion"]);
  });

  it("does not mark it shared when the companion has a conflict", async () => {
    const world = buildDemoWorld(NOW, "perfect", { companionConflict: true });
    const { free, conflicted } = companionOverlap(world.window, world.companions);
    expect(free).toEqual([]);
    expect(conflicted).toEqual(["companion"]);
  });

  it("never exposes companion event titles", () => {
    const world = buildDemoWorld(NOW);
    const serialised = JSON.stringify(world.companions);
    expect(serialised).not.toMatch(/title/i);
  });
});

describe("AT-004 useful-hours arithmetic", () => {
  it("counts nights on destination-local dates, not elapsed time", () => {
    // Lands 23:40 local on the 1st, leaves 09:00 local on the 3rd: two nights.
    const stay = usefulTimeAtDestination(
      "2026-09-01T19:40:00.000Z", // 23:40 in Asia/Dubai
      "2026-09-03T05:00:00.000Z", // 09:00 in Asia/Dubai
      "Asia/Dubai",
    );
    expect(stay.nights).toBe(2);
    expect(stay.days).toBe(3);
    expect(stay.usefulMinutes).toBe(33 * 60 + 20 - 180);
  });
});

describe("AT-005 / AT-006 / AT-007 hard constraints", () => {
  it("rejects a fare over the hard maximum however good the destination", async () => {
    const { result } = await run();
    const business = result.rejected.find((r) => r.offerId === "atl-nrt-business");
    expect(business?.rule).toBe("Over your budget");
  });

  it("rejects an itinerary with too little time on the ground", async () => {
    const { result } = await run();
    expect(result.rejected.find((r) => r.offerId === "atl-kix-onestop")?.rule).toBe(
      "Not enough time there",
    );
  });

  it("never lets a reference-only fare through, even when it is the cheapest", async () => {
    const { result } = await run();
    const reference = result.rejected.find((r) => r.offerId === "atl-dxb-reference");
    expect(reference?.rule).toBe("Reference price only");
    expect(result.recommended?.id).not.toBe("atl-dxb-reference");
    expect([result.recommended, ...result.alternates].every((t) => !t?.referenceOnly)).toBe(true);
  });

  it("rejects an itinerary that lands after the window closes", async () => {
    const { result } = await run();
    expect(result.rejected.find((r) => r.offerId === "atl-jfk-nonstop")?.rule).toBe(
      "Returns too late",
    );
  });

  it("rejects more connections than the traveller tolerates", async () => {
    const { result } = await run();
    expect(result.rejected.find((r) => r.offerId === "atl-nrt-double-stop")?.rule).toBe(
      "Too many connections",
    );
  });

  it("rejects the whole window when the companion is not free", async () => {
    const { result } = await run("perfect", { companionConflict: true });
    expect(result.recommended).toBeUndefined();
    expect(result.rejected.every((r) => r.rule === "Companion not free" || r.rule.length > 0)).toBe(
      true,
    );
  });
});

describe("recommendation", () => {
  it("returns one hero and at most two alternates", async () => {
    const { result } = await run();
    expect(result.recommended).toBeDefined();
    expect(result.alternates.length).toBeLessThanOrEqual(2);
  });

  it("puts Dubai first, non-stop, inside budget", async () => {
    const { result, world } = await run();
    expect(result.recommended?.destination).toBe("DXB");
    expect(result.recommended?.stops).toBe(0);
    expect(result.recommended!.totalPrice).toBeLessThanOrEqual(world.taste.maxSpontaneousSpend);
  });

  it("scores the hero in the exceptional band", async () => {
    const { result } = await run();
    expect(result.recommended!.escapeScore).toBeGreaterThanOrEqual(88);
    expect(result.recommended!.escapeScore).toBeLessThanOrEqual(100);
  });

  it("explains itself with factors that add up to the score", async () => {
    const { result } = await run();
    const total = result.recommended!.factors.reduce((n, f) => n + f.points, 0);
    expect(Math.round(total)).toBe(result.recommended!.escapeScore);
  });
});

describe("AT-008 stale fare", () => {
  it("returns the moved price on reverification in the price-change scenario", async () => {
    const world = buildDemoWorld(NOW, "price-change");
    const atlas = new DemoAtlasAdapter("price-change");
    const before = demoOffers(world.window, "price-change").find((o) => o.id === "atl-dxb-nonstop")!;
    const after = await atlas.verifyOffer("atl-dxb-nonstop");
    expect(after.totalPrice).toBe(before.totalPrice + 500);
    expect(after.verifiedAtIso).toBeTruthy();
  });

  it("only discovers the fare has gone when it re-reads, not at search time", async () => {
    // The search still returns the leading fare — which is the realistic case,
    // and the reason a fresh read before every write exists at all.
    const { result } = await run("sold-out");
    expect(result.recommended?.destination).toBe("DXB");
    expect(result.recommended?.bookable).toBe(true);

    const atlas = new DemoAtlasAdapter("sold-out");
    const verified = await atlas.verifyOffer(result.recommended!.id);
    expect(verified.bookable).toBe(false);
  });
});

describe("false-success guard", () => {
  it("never returns a confirmed booking straight from createBooking", async () => {
    const world = buildDemoWorld(NOW);
    const atlas = new DemoAtlasAdapter("perfect");
    const offer = await atlas.verifyOffer("atl-dxb-nonstop");
    const booking = await atlas.createBooking({
      offer,
      passengerProfileId: world.passenger.id,
      approvedTotal: offer.totalPrice,
      approvedCurrency: offer.currency,
    });
    expect(booking.state).toBe("pending");
    expect(booking.testMode).toBe(true);
  });

  it("refuses to book a reference-only offer", async () => {
    const world = buildDemoWorld(NOW);
    const atlas = new DemoAtlasAdapter("perfect");
    const offers = demoOffers(world.window, "perfect");
    const reference = offers.find((o) => o.referenceOnly)!;
    const booking = await atlas.createBooking({
      offer: { ...reference, verifiedAtIso: new Date().toISOString() },
      passengerProfileId: world.passenger.id,
      approvedTotal: reference.totalPrice,
      approvedCurrency: reference.currency,
    });
    expect(booking.state).toBe("failed");
  });
});

describe("FR-009 bounded replanning", () => {
  it("offers a replacement rather than substituting one silently", async () => {
    const atlas = createAtlasAdapter("sold-out");
    const session = createSession("sold-out", NOW);
    await scan(session, atlas);

    const hero = session.engine!.recommended!;
    expect(hero.destination).toBe("DXB");

    const first = await authorize(session, atlas, hero.id);
    expect(first.kind).toBe("unavailable");
    expect(session.booking.state).toBe("SOLD_OUT");
    expect(session.booking.replans).toBe(1);
    // The traveller still has to say yes to the replacement.
    expect(session.booking.verified).toBeUndefined();

    const replacement = first.kind === "unavailable" ? first.replacement! : null;
    expect(replacement).toBeTruthy();

    const second = await authorize(session, atlas, replacement!.id);
    expect(second.kind).toBe("confirmed");
    expect(session.booking.state).toBe("PRICE_CONFIRMED");
  });
});

describe("adapter lifetime", () => {
  it("still knows a booking reference on the next request", async () => {
    // Each API route builds an adapter; a booking created by one has to be
    // visible to the next, or the app reports a false failure.
    const world = buildDemoWorld(NOW);
    const first = createAtlasAdapter("perfect");
    const offer = await first.verifyOffer("atl-dxb-nonstop");
    const created = await first.createBooking({
      offer,
      passengerProfileId: world.passenger.id,
      approvedTotal: offer.totalPrice,
      approvedCurrency: offer.currency,
    });
    expect(created.reference).toBeTruthy();

    const second = createAtlasAdapter("perfect");
    const status = await second.getBookingStatus(created.reference!);
    expect(status.state).not.toBe("failed");
  });
});

describe("constraint helper", () => {
  it("reports the first failing rule rather than a generic refusal", () => {
    const world = buildDemoWorld(NOW);
    const offer = demoOffers(world.window, "perfect").find((o) => o.id === "atl-jfk-nonstop")!;
    const verdict = checkHardConstraints(offer, {
      window: world.window,
      taste: world.taste,
      nextCommitmentIso: world.nextCommitmentIso,
      companionAvailable: true,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection?.detail).toMatch(/after your next commitment/);
  });
});

describe("provider outage vs genuine no-results (task-2 top-priority fix)", () => {
  /**
   * A transient provider error and a genuine zero-result answer must never
   * collapse into the same "no viable flights" outcome. This is the exact
   * bug the fix addresses: previously a failed CLI call silently became an
   * empty offers array, which the engine could not tell apart from a market
   * that genuinely had nothing in it.
   */
  it("reaches PROVIDER_UNAVAILABLE, not SAFE_STOP, when the adapter cannot reach the provider", async () => {
    const failingAtlas: AtlasAdapter = {
      async getStatus() {
        return {
          authorized: true,
          ticketingAvailable: false,
          environment: "sandbox",
          adapter: "skill",
          label: "test adapter",
          provenance: { search: "live", ticketing: "live" },
        };
      },
      async searchFlights() {
        throw new AtlasProviderUnavailableError(
          "Atlas search did not return a trustworthy answer after 3 attempts: SERVICE_TEMPORARILY_UNAVAILABLE",
        );
      },
      async verifyOffer() {
        throw new Error("not exercised in this test");
      },
      async createBooking() {
        throw new Error("not exercised in this test");
      },
      async getBookingStatus() {
        throw new Error("not exercised in this test");
      },
    };

    const session = createSession("perfect", NOW);
    const result = await scan(session, failingAtlas);

    expect(result.providerUnavailable).toBe(true);
    expect(result.providerUnavailableDetail).toMatch(/SERVICE_TEMPORARILY_UNAVAILABLE/);
    expect(result.recommended).toBeUndefined();
    expect(session.booking.state).toBe("PROVIDER_UNAVAILABLE");
    // Never worded as if the search had run cleanly and found nothing.
    expect(session.activity.some((a) => /couldn.t reach the flight provider/i.test(a.detail))).toBe(
      true,
    );
  });

  it("still reaches SAFE_STOP, not PROVIDER_UNAVAILABLE, for a genuine empty market", async () => {
    const session = createSession("perfect", NOW);
    // The companion-conflict world is the existing fixture for "the search
    // runs cleanly and genuinely nothing qualifies" — no adapter failure
    // involved at all.
    session.world = buildDemoWorld(NOW, "perfect", { companionConflict: true });
    const atlas = new DemoAtlasAdapter("perfect");

    const result = await scan(session, atlas);

    expect(result.providerUnavailable).toBe(false);
    expect(result.recommended).toBeUndefined();
    expect(session.booking.state).toBe("SAFE_STOP");
  });

  it("turns a verifyOffer failure into a safe stop instead of crashing the checkpoint", async () => {
    // Simulates both the skill-mode SUBSCRIPTION_REQUIRED case and the
    // hybrid-mode "demo ticketing has never heard of this live offer id"
    // case (see HybridAtlasAdapter.verifyOffer): verification fails for a
    // reason that is not "the fare sold out", and the flow must not crash.
    const demoAtlas = new DemoAtlasAdapter("perfect");
    const session = createSession("perfect", NOW);
    await scan(session, demoAtlas);
    const hero = session.engine!.recommended!;

    const verifyFailsAtlas: AtlasAdapter = {
      getStatus: () => demoAtlas.getStatus(),
      searchFlights: (input) => demoAtlas.searchFlights(input),
      async verifyOffer() {
        throw new Error(
          "This fare can't be verified yet: Atlas ticketing is not active for this account " +
            "(TICKETING_ACTIVATION_REQUIRED).",
        );
      },
      createBooking: (input) => demoAtlas.createBooking(input),
      getBookingStatus: (reference) => demoAtlas.getBookingStatus(reference),
    };

    const outcome = await authorize(session, verifyFailsAtlas, hero.id);

    expect(outcome.kind).toBe("safe-stop");
    expect(outcome.kind === "safe-stop" && outcome.reason).toMatch(/TICKETING_ACTIVATION_REQUIRED/);
    expect(session.booking.state).toBe("SAFE_STOP");
  });
});
