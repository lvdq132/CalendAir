import { describe, expect, it, vi } from "vitest";
import { HybridAtlasAdapter } from "./hybrid-adapter";
import { SkillAtlasAdapter } from "./skill-adapter";

/**
 * The live half of hybrid mode is exercised through a mocked SkillAtlasAdapter
 * so this file never shells out to the real atlas-flight CLI — skill-adapter
 * .test.ts already covers the CLI/retry mechanics directly. What matters here
 * is HybridAtlasAdapter's own composition logic: honest per-capability
 * provenance, live search passthrough, and the demo-verify-of-a-live-offer
 * semantics documented in hybrid-adapter.ts.
 */
vi.mock("./skill-adapter", () => ({
  SkillAtlasAdapter: vi.fn().mockImplementation(() => ({
    getStatus: async () => ({
      authorized: true,
      ticketingAvailable: false,
      environment: "sandbox",
      adapter: "skill",
      label: "Atlas Skill · TICKETING_ACTIVATION_REQUIRED",
      provenance: { search: "live", ticketing: "unavailable" },
      ticketingBlockedReason: "TICKETING_ACTIVATION_REQUIRED",
    }),
    searchFlights: vi.fn(async () => [
      {
        id: "OFR-LIVE-1",
        origin: "LON",
        destination: "BCN",
        outboundDepartureIso: "2026-09-18T08:00:00.000Z",
        outboundArrivalIso: "2026-09-18T11:00:00.000Z",
        totalPrice: 250,
        currency: "GBP",
        bookable: true,
        referenceOnly: false,
        stops: 0,
        source: "ATLAS",
      },
    ]),
  })),
}));

describe("HybridAtlasAdapter — provenance", () => {
  it("reports search: live, ticketing: demo — never a blended claim", async () => {
    const adapter = new HybridAtlasAdapter("sandbox");
    const status = await adapter.getStatus();

    expect(status.adapter).toBe("hybrid");
    expect(status.provenance).toEqual({ search: "live", ticketing: "demo" });
    // Ticketing is always demo-backed here, even though the underlying live
    // adapter itself is authorized — the badge must never borrow that.
    expect(status.ticketingAvailable).toBe(false);
    expect(status.label).toMatch(/live search, demo ticketing/i);
  });

  it("still reports honestly when the live half isn't even authorized", async () => {
    vi.mocked(SkillAtlasAdapter).mockImplementationOnce(
      () =>
        ({
          getStatus: async () => ({
            authorized: false,
            ticketingAvailable: false,
            environment: "sandbox",
            adapter: "skill",
            label: "Atlas Skill · not authorized",
            // Deliberately still "live" here even though the live adapter
            // isn't authorized, to prove HybridAtlasAdapter.getStatus does
            // not just pass this through — it must re-derive provenance.search
            // from live.authorized itself (see hybrid-adapter.ts).
            provenance: { search: "live", ticketing: "live" },
          }),
          searchFlights: vi.fn(),
        }) as unknown as InstanceType<typeof SkillAtlasAdapter>,
    );
    const adapter = new HybridAtlasAdapter("sandbox");
    const status = await adapter.getStatus();
    expect(status.authorized).toBe(false);
    expect(status.label).toMatch(/not authorized/i);
    // The bug this guards against: reporting provenance.search: "live" next
    // to a label reading "search not authorized" contradicts itself in one
    // object.
    expect(status.provenance).toEqual({ search: "unavailable", ticketing: "demo" });
  });
});

describe("HybridAtlasAdapter — search is live, unmodified", () => {
  it("returns real live offers straight from the skill adapter", async () => {
    const adapter = new HybridAtlasAdapter("sandbox");
    const offers = await adapter.searchFlights({
      origin: "LON",
      departureAfter: "2026-09-18T00:00:00.000Z",
      returnBefore: "2026-09-21T00:00:00.000Z",
      adults: 1,
    });
    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe("OFR-LIVE-1");
    expect(offers[0].source).toBe("ATLAS");
  });
});

describe("HybridAtlasAdapter — verifyOffer semantics for a live-search offer id", () => {
  it("does not crash and does not fabricate a match for an offer id the demo ticketing adapter has never heard of", async () => {
    const adapter = new HybridAtlasAdapter("sandbox");
    // "OFR-LIVE-1" is a real live-search id; the demo adapter's fixed
    // inventory only ever contains ids like "atl-dxb-nonstop", so this can
    // never resolve to a demo offer.
    await expect(adapter.verifyOffer("OFR-LIVE-1")).rejects.toThrow(/TICKETING_ACTIVATION_REQUIRED/);
  });
});
