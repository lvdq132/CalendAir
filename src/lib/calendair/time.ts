/**
 * Deterministic time arithmetic.
 *
 * Every number a traveller is shown — hours opened, useful time there, return
 * buffer — is computed here in plain code. A language model is never asked to do
 * this, because timezone and day-boundary mistakes are exactly the errors that
 * make an itinerary unbookable.
 */

const MINUTE = 60_000;

export const minutes = (ms: number) => Math.round(ms / MINUTE);

export function parse(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Not an ISO instant: ${iso}`);
  return t;
}

export function minutesBetween(startIso: string, endIso: string): number {
  return minutes(parse(endIso) - parse(startIso));
}

export function hoursBetween(startIso: string, endIso: string): number {
  return minutesBetween(startIso, endIso) / 60;
}

/** The UTC offset, in minutes, that `zone` had at that instant. */
export function offsetMinutes(iso: string, zone: string): number {
  const at = new Date(parse(iso));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // `Date.UTC` of the wall-clock reading, minus the real instant, is the offset.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return minutes(asUtc - at.getTime());
}

/** Wall-clock formatting in a specific zone, so times read as the traveller sees them. */
export function formatInZone(
  iso: string,
  zone: string,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false },
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...opts }).format(new Date(parse(iso)));
}

export function dayLabel(iso: string, zone: string): string {
  return formatInZone(iso, zone, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Time genuinely available at the destination.
 *
 * Measured from arrival to the return departure, minus a fixed allowance at each
 * end for the airport itself. Nights are counted on destination-local dates, so
 * a red-eye that lands at 06:00 does not silently gain a night.
 */
export function usefulTimeAtDestination(
  arrivalIso: string,
  returnDepartureIso: string,
  destinationZone: string,
  airportAllowanceMinutes = 90,
): { usefulMinutes: number; nights: number; days: number } {
  const gross = minutesBetween(arrivalIso, returnDepartureIso);
  const usefulMinutes = Math.max(0, gross - airportAllowanceMinutes * 2);

  const localDate = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: destinationZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parse(iso)));

  const first = Date.parse(`${localDate(arrivalIso)}T00:00:00Z`);
  const last = Date.parse(`${localDate(returnDepartureIso)}T00:00:00Z`);
  const nights = Math.max(0, Math.round((last - first) / (24 * 60 * MINUTE)));

  return { usefulMinutes, nights, days: nights + 1 };
}

/** Free time left between landing back home and the next commitment. */
export function returnBuffer(homeArrivalIso: string, nextCommitmentIso: string): number {
  return Math.max(0, minutesBetween(homeArrivalIso, nextCommitmentIso));
}

export function humaniseHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "2 nights 3 days", the phrasing used across the comps. */
export function humaniseStay(nights: number, days: number): string {
  return `${nights} ${nights === 1 ? "night" : "nights"} ${days} ${days === 1 ? "day" : "days"}`;
}

/** Two free/busy ranges overlap when neither ends before the other starts. */
export function overlaps(
  a: { startIso: string; endIso: string },
  b: { startIso: string; endIso: string },
): boolean {
  return parse(a.startIso) < parse(b.endIso) && parse(b.startIso) < parse(a.endIso);
}
