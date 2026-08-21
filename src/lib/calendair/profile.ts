import { ORIGIN_BY_IATA, ORIGINS } from "./destinations";
import { isSupportedCurrency } from "./money";
import {
  TASTE_TAGS,
  type CalendarProvider,
  type NotificationLevel,
  type SpontaneityLevel,
  type TasteTag,
  type TravelTaste,
} from "./types";

/**
 * The traveller profile — what onboarding collects, and the only route by which
 * a person's preferences reach the engine.
 *
 * Two rules shape this file. First, the profile arrives from a browser, so every
 * value is re-derived on the server by `sanitiseProfile` before anything acts on
 * it: a hard budget that a client could set to infinity is not a hard budget.
 * Second, the conversion to `TravelTaste` is a pure projection, so the engine
 * keeps taking exactly one shape of input whether it came from a wizard or from
 * the prepared demo profile.
 *
 * Nothing here is React, and nothing here is asked of a language model.
 */

export interface TravellerProfile {
  version: 1;
  /** ISO instant the traveller finished onboarding; null while incomplete. */
  completedAt: string | null;
  calendarProvider: CalendarProvider;
  travellerName: string;
  homeCity: string;
  originAirport: string;
  timezone: string;
  spontaneity: SpontaneityLevel;
  maxSpontaneousSpend: number;
  currency: string;
  maxFlightMinutes: number;
  maxStops: number;
  directPreferred: boolean;
  redEyeTolerated: boolean;
  minUsefulHours: number;
  returnBufferMinutes: number;
  interests: TasteTag[];
  dreamDestinations: string[];
  /** First name only. Free/busy overlap never needs more than a label. */
  companionName: string | null;
  notifications: NotificationLevel;
}

/**
 * The limits a stated preference is held to.
 *
 * These are not opinions about good travel; they are the range in which the
 * arithmetic downstream stays meaningful. A 500-hour minimum stay or a zero
 * budget produces a screen that can only ever say "nothing qualified".
 */
export const BOUNDS = {
  spend: { min: 200, max: 200_000 },
  flightMinutes: { min: 60, max: 1_440 },
  stops: { min: 0, max: 2 },
  usefulHours: { min: 4, max: 120 },
  bufferMinutes: { min: 0, max: 2_880 },
  interests: { max: 5 },
  dreams: { max: 8 },
  text: { max: 40 },
} as const;

export const SPONTANEITY_LEVELS: SpontaneityLevel[] = ["safe", "curious", "wild"];
export const NOTIFICATION_LEVELS: NotificationLevel[] = ["quiet", "balanced", "spontaneous"];

/**
 * The prepared demo profile.
 *
 * A judged run cannot depend on somebody completing a wizard on stage, so this is
 * a complete, deterministic traveller. It is also the profile the engine falls
 * back to when no one has onboarded, which is why the demo numbers hold.
 */
export const DEMO_PROFILE: TravellerProfile = {
  version: 1,
  completedAt: null,
  calendarProvider: "demo",
  travellerName: "Adrien",
  homeCity: "Shanghai",
  originAirport: "PVG",
  timezone: "Asia/Shanghai",
  spontaneity: "curious",
  maxSpontaneousSpend: 6000,
  currency: "CNY",
  maxFlightMinutes: 720,
  maxStops: 1,
  directPreferred: true,
  redEyeTolerated: false,
  minUsefulHours: 20,
  returnBufferMinutes: 480,
  interests: ["Food", "Culture", "Wellness", "Nightlife"],
  dreamDestinations: ["Dubai", "Tokyo", "Paris", "New York City"],
  companionName: "Sophie",
  notifications: "balanced",
};

/** Where a fresh wizard starts: the brief's defaults, nothing decided for them. */
export const BLANK_PROFILE: TravellerProfile = {
  ...DEMO_PROFILE,
  completedAt: null,
  travellerName: "",
  interests: [],
  dreamDestinations: [],
  companionName: null,
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A finite number, or the fallback. Rejects NaN, Infinity and numeric strings. */
function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.round(clamp(n, min, max));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Free text, made safe to store, render and log.
 *
 * Control characters are stripped rather than escaped: this text is shown on a
 * screen and written to an activity log, and neither has any use for them.
 */
function text(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, BOUNDS.text.max);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** True when the runtime recognises the zone, which is the only test that matters. */
export function isKnownTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rebuild a trustworthy profile from untrusted input.
 *
 * Every field is independently recovered, so one bad value degrades to its
 * default instead of discarding an otherwise good profile. This never throws and
 * always returns something the engine can run on.
 */
export function sanitiseProfile(input: unknown): TravellerProfile {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const base = DEMO_PROFILE;

  const originAirport = oneOf(
    typeof raw.originAirport === "string" ? raw.originAirport.toUpperCase() : undefined,
    ORIGINS.map((o) => o.iata),
    base.originAirport,
  );

  const currencyRaw = typeof raw.currency === "string" ? raw.currency.toUpperCase() : "";
  const currency = isSupportedCurrency(currencyRaw) ? currencyRaw : base.currency;

  const timezoneRaw = typeof raw.timezone === "string" ? raw.timezone : "";
  const timezone = isKnownTimezone(timezoneRaw)
    ? timezoneRaw
    : (ORIGIN_BY_IATA[originAirport]?.zone ?? base.timezone);

  // Deduplicated, order preserved: the order a traveller chose is the order the
  // dream-list weighting reads.
  const interests = Array.isArray(raw.interests)
    ? Array.from(
        new Set(raw.interests.filter((t): t is TasteTag => TASTE_TAGS.includes(t as TasteTag))),
      ).slice(0, BOUNDS.interests.max)
    : [];

  const dreamDestinations = Array.isArray(raw.dreamDestinations)
    ? Array.from(
        new Set(
          raw.dreamDestinations
            .map((d) => text(d, ""))
            .filter((d) => d.length > 0),
        ),
      ).slice(0, BOUNDS.dreams.max)
    : [];

  const companionRaw = text(raw.companionName, "");

  return {
    version: 1,
    completedAt: typeof raw.completedAt === "string" && raw.completedAt ? raw.completedAt : null,
    calendarProvider: oneOf(raw.calendarProvider, ["demo", "google"], base.calendarProvider),
    travellerName: text(raw.travellerName, base.travellerName) || base.travellerName,
    homeCity: text(raw.homeCity, "") || (ORIGIN_BY_IATA[originAirport]?.city ?? base.homeCity),
    originAirport,
    timezone,
    spontaneity: oneOf(raw.spontaneity, SPONTANEITY_LEVELS, base.spontaneity),
    maxSpontaneousSpend: num(
      raw.maxSpontaneousSpend,
      base.maxSpontaneousSpend,
      BOUNDS.spend.min,
      BOUNDS.spend.max,
    ),
    currency,
    maxFlightMinutes: num(
      raw.maxFlightMinutes,
      base.maxFlightMinutes,
      BOUNDS.flightMinutes.min,
      BOUNDS.flightMinutes.max,
    ),
    maxStops: num(raw.maxStops, base.maxStops, BOUNDS.stops.min, BOUNDS.stops.max),
    directPreferred: bool(raw.directPreferred, base.directPreferred),
    redEyeTolerated: bool(raw.redEyeTolerated, base.redEyeTolerated),
    minUsefulHours: num(
      raw.minUsefulHours,
      base.minUsefulHours,
      BOUNDS.usefulHours.min,
      BOUNDS.usefulHours.max,
    ),
    returnBufferMinutes: num(
      raw.returnBufferMinutes,
      base.returnBufferMinutes,
      BOUNDS.bufferMinutes.min,
      BOUNDS.bufferMinutes.max,
    ),
    interests,
    dreamDestinations,
    companionName: companionRaw.length > 0 ? companionRaw : null,
    notifications: oneOf(raw.notifications, NOTIFICATION_LEVELS, base.notifications),
  };
}

/** The projection the engine consumes. Pure, and total. */
export function tasteFromProfile(profile: TravellerProfile): TravelTaste {
  return {
    travellerName: profile.travellerName,
    homeCity: profile.homeCity,
    originAirport: profile.originAirport,
    interests: [...profile.interests],
    dreamDestinations: [...profile.dreamDestinations],
    maxSpontaneousSpend: profile.maxSpontaneousSpend,
    currency: profile.currency,
    maxFlightMinutes: profile.maxFlightMinutes,
    maxStops: profile.maxStops,
    redEyeTolerated: profile.redEyeTolerated,
    directPreferred: profile.directPreferred,
    minUsefulHours: profile.minUsefulHours,
    returnBufferMinutes: profile.returnBufferMinutes,
    spontaneity: profile.spontaneity,
  };
}
