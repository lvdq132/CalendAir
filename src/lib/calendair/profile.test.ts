import { describe, expect, it } from "vitest";
import {
  BOUNDS,
  DEMO_PROFILE,
  sanitiseProfile,
  tasteFromProfile,
  type TravellerProfile,
} from "./profile";
import { convertAmount, isSupportedCurrency } from "./money";
import { buildDemoWorld, TASTE } from "./demo/world";
import { checkHardConstraints } from "./constraints";
import { runOpportunityEngine } from "./engine";
import { DemoAtlasAdapter } from "@/lib/atlas/demo-adapter";
import { demoOffers } from "./demo/inventory";
import { DESTINATIONS } from "./destinations";
import { TASTE_TAGS } from "./types";

/**
 * What onboarding is allowed to do to the engine — and what it must never do.
 *
 * A preference arrives from a browser. If a browser can widen a hard constraint,
 * the hard constraint was never hard, so most of this file is about a profile
 * being rebuilt rather than trusted.
 */

const NOW = new Date("2026-08-19T02:00:00.000Z");

async function runWith(profile?: TravellerProfile) {
  const world = buildDemoWorld(NOW, "perfect", profile ? { profile } : {});
  const atlas = new DemoAtlasAdapter("perfect");
  const result = await runOpportunityEngine(atlas, {
    window: world.window,
    taste: world.taste,
    companions: world.companions,
    nextCommitmentIso: world.nextCommitmentIso,
  });
  return { world, result };
}

describe("profile sanitising — a browser cannot widen a hard rule", () => {
  it("clamps an absurd budget down to the documented ceiling", () => {
    const p = sanitiseProfile({ ...DEMO_PROFILE, maxSpontaneousSpend: 9_999_999_999 });
    expect(p.maxSpontaneousSpend).toBe(BOUNDS.spend.max);
  });

  it("clamps a zero or negative budget up to the documented floor", () => {
    expect(sanitiseProfile({ maxSpontaneousSpend: 0 }).maxSpontaneousSpend).toBe(BOUNDS.spend.min);
    expect(sanitiseProfile({ maxSpontaneousSpend: -5000 }).maxSpontaneousSpend).toBe(
      BOUNDS.spend.min,
    );
  });

  it("treats Infinity and NaN as garbage, not as very large numbers", () => {
    const p = sanitiseProfile({
      maxSpontaneousSpend: Number.POSITIVE_INFINITY,
      minUsefulHours: Number.NaN,
      returnBufferMinutes: Number.NEGATIVE_INFINITY,
    });
    // Clamping Infinity to the maximum would silently grant the widest budget the
    // product allows. A value that is not a number falls back to the default.
    expect(p.maxSpontaneousSpend).toBe(DEMO_PROFILE.maxSpontaneousSpend);
    expect(p.minUsefulHours).toBe(DEMO_PROFILE.minUsefulHours);
    expect(p.returnBufferMinutes).toBe(DEMO_PROFILE.returnBufferMinutes);
    expect(Number.isFinite(p.maxSpontaneousSpend)).toBe(true);
  });

  it("clamps finite out-of-range numbers instead of discarding them", () => {
    expect(sanitiseProfile({ minUsefulHours: 1 }).minUsefulHours).toBe(BOUNDS.usefulHours.min);
    expect(sanitiseProfile({ minUsefulHours: 9_000 }).minUsefulHours).toBe(BOUNDS.usefulHours.max);
    expect(sanitiseProfile({ returnBufferMinutes: -1 }).returnBufferMinutes).toBe(
      BOUNDS.bufferMinutes.min,
    );
  });

  it("rejects a numeric string, because '6000' is not a number the engine may use", () => {
    const p = sanitiseProfile({ maxSpontaneousSpend: "6000" });
    expect(p.maxSpontaneousSpend).toBe(DEMO_PROFILE.maxSpontaneousSpend);
  });

  it("caps connection tolerance at the documented maximum", () => {
    expect(sanitiseProfile({ maxStops: 99 }).maxStops).toBe(BOUNDS.stops.max);
  });

  it("keeps only known taste tags, deduplicated, and no more than the cap", () => {
    const p = sanitiseProfile({
      interests: ["Food", "Food", "Culture", "Nonsense", 7, null, "Beach", "Nature", "History", "Events"],
    });
    expect(p.interests).toEqual(["Food", "Culture", "Beach", "Nature", "History"]);
    expect(p.interests.length).toBeLessThanOrEqual(BOUNDS.interests.max);
  });

  it("falls back to a known origin rather than searching from an invented airport", () => {
    expect(sanitiseProfile({ originAirport: "ZZZ" }).originAirport).toBe(DEMO_PROFILE.originAirport);
    expect(sanitiseProfile({ originAirport: "pvg" }).originAirport).toBe("PVG");
  });

  it("falls back to a supported currency rather than an unpriceable one", () => {
    expect(sanitiseProfile({ currency: "XYZ" }).currency).toBe(DEMO_PROFILE.currency);
    expect(sanitiseProfile({ currency: "usd" }).currency).toBe("USD");
  });

  it("replaces an unknown timezone with the home airport's own zone", () => {
    const p = sanitiseProfile({ originAirport: "PVG", timezone: "Mars/Olympus" });
    expect(p.timezone).toBe("Asia/Shanghai");
  });

  it("strips control characters out of free text before it can reach a log", () => {
    const p = sanitiseProfile({ travellerName: "Ad\u0000ri\u001ben\n\n", companionName: "So\u007fphie" });
    expect(p.travellerName).toBe("Ad ri en");
    expect(p.companionName).toBe("So phie");
    expect(JSON.stringify(p)).not.toMatch(/[\u0000-\u001f\u007f]/);
  });

  it("bounds free text and the dream list by length", () => {
    const long = "x".repeat(500);
    const p = sanitiseProfile({
      travellerName: long,
      dreamDestinations: Array.from({ length: 40 }, (_, i) => `City ${i}`),
    });
    expect(p.travellerName.length).toBeLessThanOrEqual(BOUNDS.text.max);
    expect(p.dreamDestinations.length).toBe(BOUNDS.dreams.max);
  });

  it("survives garbage entirely, returning a runnable profile", () => {
    for (const junk of [null, undefined, 42, "profile", [], { version: "nope" }]) {
      const p = sanitiseProfile(junk);
      expect(p.version).toBe(1);
      expect(Number.isFinite(p.maxSpontaneousSpend)).toBe(true);
      expect(p.currency).toBe(DEMO_PROFILE.currency);
    }
  });

  it("never treats an unfinished profile as finished", () => {
    expect(sanitiseProfile({ completedAt: "" }).completedAt).toBeNull();
    expect(sanitiseProfile({ completedAt: 12345 }).completedAt).toBeNull();
  });
});

describe("the demo profile is the demo world", () => {
  it("projects to exactly the taste the engine has always run on", () => {
    expect(tasteFromProfile(DEMO_PROFILE)).toEqual(TASTE);
  });

  it("is unchanged by sanitising, so the prepared traveller is already legal", () => {
    expect(tasteFromProfile(sanitiseProfile(DEMO_PROFILE))).toEqual(TASTE);
  });

  it("reports which profile is driving a run", async () => {
    const demo = buildDemoWorld(NOW, "perfect");
    expect(demo.profileSource).toBe("demo");

    const own = buildDemoWorld(NOW, "perfect", {
      profile: { ...DEMO_PROFILE, completedAt: NOW.toISOString() },
    });
    expect(own.profileSource).toBe("traveller");
  });

  it("still produces the Escape Score of 91 that the documents quote", async () => {
    // README, HACKATHON.md and DEMO_SCRIPT.md all say "Dubai, Escape Score 91".
    // Pinned here so a scoring change cannot quietly make the pitch untrue.
    const { result } = await runWith();
    expect(result.recommended?.destinationName).toBe("Dubai");
    expect(result.recommended?.escapeScore).toBe(91);
  });
});

describe("a profile genuinely reaches the engine", () => {
  it("applies the traveller's budget as a hard rule, not a suggestion", async () => {
    const frugal = sanitiseProfile({ ...DEMO_PROFILE, maxSpontaneousSpend: 2500 });
    const { result } = await runWith(frugal);

    // Dubai at 4,980 is now out of reach; the cheapest bookable fare wins instead.
    expect(result.recommended?.destination).toBe("NRT");
    expect(result.recommended!.totalPrice).toBeLessThanOrEqual(2500);
    expect(result.rejected.find((r) => r.offerId === "atl-dxb-nonstop")?.rule).toBe(
      "Over your budget",
    );
  });

  it("honours a non-stop-only tolerance", async () => {
    const strict = sanitiseProfile({ ...DEMO_PROFILE, maxStops: 0 });
    const { result } = await runWith(strict);
    expect([result.recommended, ...result.alternates].every((t) => t?.stops === 0)).toBe(true);
  });

  it("searches for one seat and skips the overlap check when travelling alone", async () => {
    const alone = sanitiseProfile({ ...DEMO_PROFILE, companionName: null });
    const { world, result } = await runWith(alone);

    expect(world.companions).toEqual([]);
    expect(world.window.companionIds).toEqual([]);
    expect(world.window.sharedWith).toEqual([]);
    // Nobody to conflict with, so a recommendation is still reached.
    expect(result.recommended).toBeDefined();
  });

  it("carries a renamed companion through without inventing a calendar", async () => {
    const p = sanitiseProfile({ ...DEMO_PROFILE, companionName: "Marie" });
    const { world } = await runWith(p);
    expect(world.companions[0].name).toBe("Marie");
    expect(JSON.stringify(world.companions)).not.toMatch(/title/i);
  });

  it("raises the minimum useful hours into a real rejection", async () => {
    const p = sanitiseProfile({ ...DEMO_PROFILE, minUsefulHours: 60 });
    const { result } = await runWith(p);
    expect(result.recommended).toBeUndefined();
    expect(result.rejected.some((r) => r.rule === "Not enough time there")).toBe(true);
  });
});

describe("stated interests are scored, not merely stored", () => {
  it("every taste tag is reachable from the catalogue", () => {
    // A tag no destination carries would be a question with no consequence.
    for (const tag of TASTE_TAGS) {
      expect(DESTINATIONS.some((d) => d.tags.includes(tag))).toBe(true);
    }
  });

  it("lifts affinity for a destination that matches the interests", async () => {
    const base = { ...DEMO_PROFILE, dreamDestinations: [] };
    const nature = sanitiseProfile({ ...base, interests: ["Nature"] });
    const food = sanitiseProfile({ ...base, interests: ["Food"] });

    const affinityOf = async (profile: TravellerProfile, iata: string) => {
      const { result } = await runWith(profile);
      const trip = [result.recommended, ...result.alternates].find((t) => t?.destination === iata);
      return trip?.factors.find((f) => f.id === "affinity")?.points ?? null;
    };

    // Tokyo carries Food and not Nature, so the same city is worth more to one of
    // these travellers than the other.
    const tokyoForFood = await affinityOf(food, "NRT");
    const tokyoForNature = await affinityOf(nature, "NRT");
    expect(tokyoForFood).not.toBeNull();
    expect(tokyoForNature).not.toBeNull();
    expect(tokyoForFood!).toBeGreaterThan(tokyoForNature!);
  });

  it("never lets interests overtake a dream-list match", async () => {
    const { result } = await runWith();
    const hero = result.recommended!;
    const affinity = hero.factors.find((f) => f.id === "affinity")!;
    // Dubai is first on the dream list: already at the ceiling, so nothing can add.
    expect(affinity.points).toBe(affinity.max);
    expect(affinity.detail).toBe("On your dream list");
  });

  it("keeps the score the sum of its factors whatever the profile", async () => {
    for (const interests of [[], ["Nature"], ["Food", "Culture", "Wellness", "Nightlife", "Beach"]]) {
      const p = sanitiseProfile({ ...DEMO_PROFILE, interests });
      const { result } = await runWith(p);
      for (const trip of [result.recommended, ...result.alternates]) {
        if (!trip) continue;
        const total = trip.factors.reduce((n, f) => n + f.points, 0);
        expect(Math.round(total)).toBe(trip.escapeScore);
        expect(trip.escapeScore).toBeGreaterThanOrEqual(0);
        expect(trip.escapeScore).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("spontaneity moves a preference and nothing else", () => {
  it("changes what an unfamiliar destination is worth", async () => {
    const base = { ...DEMO_PROFILE, dreamDestinations: [], interests: [] };
    const affinityFor = async (level: "safe" | "curious" | "wild") => {
      const { result } = await runWith(sanitiseProfile({ ...base, spontaneity: level }));
      const trip = [result.recommended, ...result.alternates].find((t) => t?.destination === "NRT");
      return trip!.factors.find((f) => f.id === "affinity")!.points;
    };
    const safe = await affinityFor("safe");
    const curious = await affinityFor("curious");
    const wild = await affinityFor("wild");
    expect(safe).toBeLessThan(curious);
    expect(curious).toBeLessThan(wild);
  });

  it("cannot buy an itinerary past a hard constraint", async () => {
    const wild = sanitiseProfile({
      ...DEMO_PROFILE,
      spontaneity: "wild",
      maxSpontaneousSpend: 2500,
    });
    const { result } = await runWith(wild);

    // Every survivor is still inside the budget and still bookable, however
    // adventurous the traveller claimed to be.
    for (const trip of [result.recommended, ...result.alternates]) {
      if (!trip) continue;
      expect(trip.totalPrice).toBeLessThanOrEqual(2500);
      expect(trip.referenceOnly).toBe(false);
    }
    // The reference-only fare is rejected either way; at this budget the ceiling
    // simply happens to be the first rule it fails.
    expect(result.rejected.some((r) => r.offerId === "atl-dxb-reference")).toBe(true);
  });

  it("still rejects a reference-only fare that is comfortably affordable", async () => {
    const wild = sanitiseProfile({ ...DEMO_PROFILE, spontaneity: "wild" });
    const { result } = await runWith(wild);
    expect(result.rejected.find((r) => r.offerId === "atl-dxb-reference")?.rule).toBe(
      "Reference price only",
    );
  });
});

describe("a budget is only a rule when the units match", () => {
  it("converts a ceiling into the currency the fare is quoted in", () => {
    expect(convertAmount(6000, "CNY", "CNY")).toBe(6000);
    const usd = convertAmount(6000, "CNY", "USD")!;
    expect(usd).toBeGreaterThan(0);
    expect(usd).toBeLessThan(6000);
    // Round-tripping returns to roughly where it started.
    expect(convertAmount(usd, "USD", "CNY")!).toBeCloseTo(6000, -2);
  });

  it("refuses an unknown currency instead of inventing a rate", () => {
    expect(convertAmount(100, "CNY", "XYZ")).toBeNull();
    expect(isSupportedCurrency("XYZ")).toBe(false);
  });

  it("does not silently pass a fare when the two currencies cannot be compared", () => {
    const world = buildDemoWorld(NOW);
    const offer = demoOffers(world.window, "perfect").find((o) => o.id === "atl-nrt-nonstop")!;
    const verdict = checkHardConstraints(offer, {
      window: world.window,
      // A currency the rate table does not carry, forced past the sanitiser.
      taste: { ...world.taste, currency: "XYZ" },
      nextCommitmentIso: world.nextCommitmentIso,
      companionAvailable: true,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection?.rule).toBe("Budget not comparable");
  });

  it("compares correctly across currencies rather than comparing raw numbers", () => {
    const world = buildDemoWorld(NOW);
    const offer = demoOffers(world.window, "perfect").find((o) => o.id === "atl-nrt-nonstop")!;
    // 2,180 CNY is roughly 305 USD. A 6,000 USD ceiling is generous; 100 USD is not.
    // Compared naively, both would pass — 2,180 > 100 is the bug this prevents.
    const check = (max: number) =>
      checkHardConstraints(offer, {
        window: world.window,
        taste: { ...world.taste, currency: "USD", maxSpontaneousSpend: max },
        nextCommitmentIso: world.nextCommitmentIso,
        companionAvailable: true,
      });
    expect(check(6000).ok).toBe(true);
    expect(check(100).ok).toBe(false);
    expect(check(100).rejection?.rule).toBe("Over your budget");
  });

  it("scores budget headroom against the converted ceiling, not the raw figure", async () => {
    // The same ceiling, stated in two currencies. If scoring divided the fare by
    // the raw number, the USD traveller would appear to have vastly more room.
    const inCny = sanitiseProfile({ ...DEMO_PROFILE, currency: "CNY", maxSpontaneousSpend: 6000 });
    const inUsd = sanitiseProfile({
      ...DEMO_PROFILE,
      currency: "USD",
      maxSpontaneousSpend: convertAmount(6000, "CNY", "USD")!,
    });

    const headroomOf = async (profile: TravellerProfile) => {
      const { result } = await runWith(profile);
      const trip = [result.recommended, ...result.alternates].find((t) => t?.destination === "NRT");
      return trip!.factors.find((f) => f.id === "budgetFit")!.points;
    };

    expect(await headroomOf(inUsd)).toBeCloseTo(await headroomOf(inCny), 1);
  });

  it("awards no budget headroom when the ceiling could not be converted", () => {
    const world = buildDemoWorld(NOW);
    const offer = demoOffers(world.window, "perfect").find((o) => o.id === "atl-nrt-nonstop")!;
    const verdict = checkHardConstraints(offer, {
      window: world.window,
      taste: { ...world.taste, currency: "XYZ" },
      nextCommitmentIso: world.nextCommitmentIso,
      companionAvailable: true,
    });
    // The offer never reaches scoring, but the verdict must not carry a ceiling
    // that something downstream could divide by.
    expect(verdict.ceiling).toBe(0);
  });
});

describe("no secret and no private detail is carried in a profile", () => {
  it("keeps unrecognised fields out entirely", () => {
    const p = sanitiseProfile({
      ...DEMO_PROFILE,
      accessToken: "ya29.super-secret",
      passportNumber: "X1234567",
      cardNumber: "4111111111111111",
      googleRefreshToken: "1//refresh",
    });
    const serialised = JSON.stringify(p);
    expect(serialised).not.toMatch(/ya29|X1234567|4111|refresh/i);
    expect(Object.keys(p)).not.toContain("accessToken");
  });

  it("carries no companion event content into the world the client is sent", () => {
    const world = buildDemoWorld(NOW, "perfect", {
      profile: { ...DEMO_PROFILE, completedAt: NOW.toISOString() },
    });
    const serialised = JSON.stringify(world.companions);
    expect(serialised).not.toMatch(/title/i);
    for (const block of world.companions.flatMap((c) => c.busy)) {
      expect(Object.keys(block).sort()).toEqual(["endIso", "id", "startIso"]);
    }
  });
});
