import { DESTINATION_BY_IATA, ORIGIN_BY_IATA } from "@/lib/calendair/destinations";
import { formatInZone } from "@/lib/calendair/time";

const SYMBOL: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

export function money(amount: number, currency = "CNY"): string {
  const symbol = SYMBOL[currency] ?? "";
  return `${symbol}${Math.round(amount).toLocaleString("en-US")}`;
}

export function zoneFor(iata: string): string {
  return DESTINATION_BY_IATA[iata]?.zone ?? ORIGIN_BY_IATA[iata]?.zone ?? "UTC";
}

export function placeName(iata: string): string {
  return (
    DESTINATION_BY_IATA[iata]?.airportName ?? ORIGIN_BY_IATA[iata]?.airportName ?? iata
  );
}

export function cityName(iata: string): string {
  return DESTINATION_BY_IATA[iata]?.city ?? ORIGIN_BY_IATA[iata]?.city ?? iata;
}

/** Local clock time where it happens, which is the only time a traveller cares about. */
export function localTime(iso: string, iata: string): string {
  return formatInZone(iso, zoneFor(iata), { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function localDate(iso: string, iata: string): string {
  return formatInZone(iso, zoneFor(iata), { day: "numeric", month: "short" });
}

export function localDay(iso: string, iata: string): string {
  return formatInZone(iso, zoneFor(iata), { weekday: "short" });
}

export function dateRange(startIso: string, endIso: string, iata: string): string {
  return `${localDate(startIso, iata)} – ${localDate(endIso, iata)}`;
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "+1" when the arrival lands on a later local day than the departure. */
export function dayShift(departIso: string, arriveIso: string, arriveIata: string): string {
  const d = formatInZone(departIso, zoneFor(arriveIata), { day: "numeric" });
  const a = formatInZone(arriveIso, zoneFor(arriveIata), { day: "numeric" });
  return d === a ? "" : "+1";
}
