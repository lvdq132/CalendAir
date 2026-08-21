import type {
  BusyBlock,
  Companion,
  DetectedWindow,
  DemoScenario,
  PassengerProfile,
  TravelTaste,
} from "../types";
import { DEMO_PROFILE, tasteFromProfile, type TravellerProfile } from "../profile";
import { hoursBetween, overlaps } from "../time";

/**
 * The deterministic demo world.
 *
 * Calendar, companion and profile data are fixed by design: a stage demo cannot
 * depend on somebody's real Friday. Everything is generated relative to "now" so
 * the opening is always in the near future, and the same inputs always produce
 * the same window.
 */

const SHANGHAI_OFFSET_MIN = 8 * 60; // Asia/Shanghai has no daylight saving.
const MIN = 60_000;

/** The instant of the next `weekday` at `hour` local Shanghai time, after `from`. */
function nextLocalWeekday(from: Date, weekday: number, hour: number): Date {
  const local = new Date(from.getTime() + SHANGHAI_OFFSET_MIN * MIN);
  const day = local.getUTCDay();
  let delta = (weekday - day + 7) % 7;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let candidate = midnight + delta * 24 * 60 * MIN + hour * 60 * MIN;
  if (candidate <= local.getTime()) {
    delta += 7;
    candidate = midnight + delta * 24 * 60 * MIN + hour * 60 * MIN;
  }
  return new Date(candidate - SHANGHAI_OFFSET_MIN * MIN);
}

/**
 * The taste the engine runs on when nobody has onboarded.
 *
 * Derived from the prepared demo profile rather than written twice, so the
 * wizard and the stage demo can never drift apart.
 */
export const TASTE: TravelTaste = tasteFromProfile(DEMO_PROFILE);

export const PASSENGER: PassengerProfile = {
  id: "pax-demo-1",
  fullName: "TEST/TRAVELER",
  gender: "Male",
  dateOfBirth: "1990-01-01",
  nationality: "JP",
  documentType: "Passport",
  documentNumber: "TR0000001",
  issuingCountry: "JP",
  documentExpiry: "2032-12-31",
  fictional: true,
};

export interface DemoWorld {
  now: string;
  scenario: DemoScenario;
  taste: TravelTaste;
  companions: Companion[];
  busy: BusyBlock[];
  window: DetectedWindow;
  nextCommitmentIso: string;
  passenger: PassengerProfile;
  /** The profile the taste came from, so a screen can state which one is live. */
  profile: TravellerProfile;
  profileSource: "demo" | "traveller";
}

/**
 * Build the world.
 *
 * The story is always the same: a Friday afternoon client review is released,
 * and the gap it leaves runs to Monday morning. `companionConflict` exists so
 * the shared-availability rule can be exercised without private event content.
 *
 * A traveller's own profile changes who is in it and which rules apply, but not
 * the shape of the opening — the calendar is the fictional part, and it stays
 * deterministic so the demo is repeatable.
 */
export function buildDemoWorld(
  now: Date,
  scenario: DemoScenario = "perfect",
  opts: { companionConflict?: boolean; profile?: TravellerProfile } = {},
): DemoWorld {
  const profile = opts.profile ?? DEMO_PROFILE;
  const taste = opts.profile ? tasteFromProfile(opts.profile) : TASTE;
  const friday14 = nextLocalWeekday(now, 5, 14);
  const at = (dayOffset: number, hour: number, minute = 0) =>
    new Date(
      friday14.getTime() + dayOffset * 24 * 60 * MIN + (hour - 14) * 60 * MIN + minute * MIN,
    ).toISOString();

  const windowStart = friday14.toISOString();
  const windowEnd = at(3, 10); // Monday 10:00 local.

  const released = {
    title: "Client review — Q3 roadmap",
    startIso: at(0, 14),
    endIso: at(0, 18),
  };

  const busy: BusyBlock[] = [
    { id: "b1", startIso: at(0, 9), endIso: at(0, 11), title: "Design critique" },
    { id: "b2", startIso: at(0, 11, 30), endIso: at(0, 13), title: "Supplier call" },
    { id: "b3", ...released, released: true },
    { id: "b4", startIso: at(3, 10), endIso: at(3, 11, 30), title: "Leadership sync" },
    { id: "b5", startIso: at(3, 14), endIso: at(3, 15), title: "Design review" },
  ];

  const companion: Companion = {
    id: "companion",
    name: profile.companionName ?? "Sophie",
    relationship: "Partner",
    busy: [
      { id: "s1", startIso: at(0, 9, 30), endIso: at(0, 12) },
      // The same Monday sync, which is why the window closes when it does.
      { id: "s2", startIso: at(3, 10), endIso: at(3, 11, 30) },
      ...(opts.companionConflict
        ? [{ id: "s3", startIso: at(1, 10), endIso: at(1, 16) }]
        : []),
    ],
  };

  // A traveller who named nobody travels alone; the overlap rule then has nothing
  // to check rather than a stranger to invent.
  const companions: Companion[] = profile.companionName === null ? [] : [companion];

  const conflicts =
    companions.length > 0 &&
    companion.busy.some((b) => overlaps(b, { startIso: windowStart, endIso: windowEnd }));

  const hours = Math.round(hoursBetween(windowStart, windowEnd));

  const window: DetectedWindow = {
    id: "win-1",
    startIso: windowStart,
    endIso: windowEnd,
    originAirport: taste.originAirport,
    companionIds: companions.map((c) => c.id),
    minUsefulHours: taste.minUsefulHours,
    returnBufferMinutes: taste.returnBufferMinutes,
    hours,
    sharedWith: companions.length === 0 || conflicts ? [] : companions.map((c) => c.id),
    conflictedWith: conflicts ? companions.map((c) => c.id) : [],
    openedBy: released,
    headline: `${hours} hours opened`,
    subhead:
      hours >= 70
        ? "A rare opening for an exceptional escape."
        : "Great window for a premium escape.",
  };

  return {
    now: now.toISOString(),
    scenario,
    taste,
    companions,
    busy,
    window,
    nextCommitmentIso: windowEnd,
    passenger: PASSENGER,
    profile,
    profileSource: opts.profile ? "traveller" : "demo",
  };
}
