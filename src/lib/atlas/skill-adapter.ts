/**
 * SkillAtlasAdapter — live Atlas integration via the local atlas-flight CLI.
 *
 * Commands follow .agents/skills/atlas-flight-booking/references/cli-contract.md
 * exactly. Field names are drawn from observed CLI output, not invented.
 *
 * Current account state: search_available=true, ticketing_available=false
 * (TICKETING_ACTIVATION_REQUIRED). Offers come back price_status="reference"
 * and are correctly refused by the booking flow without reaching createBooking.
 * Once activation completes, bookable offers will flow through all five methods.
 */

import { execFile, execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import type { AtlasAdapter } from "./adapter";
import type {
  AtlasAccountStatus,
  BookingInput,
  BookingResult,
  FlightSearchInput,
  NormalizedOffer,
  VerifiedOffer,
} from "@/lib/calendair/types";
import { offsetMinutes } from "@/lib/calendair/time";

// ─── Airport timezone table ───────────────────────────────────────────────────

/**
 * IANA zone keyed by IATA code.
 * Used to convert the CLI's wall-clock departure/arrival times to UTC instants.
 * Falls back to treating unknown airports as UTC — an error of ±offset hours,
 * acceptable for constraint checks in the opportunity engine.
 */
const AIRPORT_ZONE: Record<string, string> = {
  // Demo origins
  PVG: "Asia/Shanghai", PEK: "Asia/Shanghai",
  // Destinations in the product catalogue
  DXB: "Asia/Dubai",
  NRT: "Asia/Tokyo", KIX: "Asia/Tokyo",
  SIN: "Asia/Singapore",
  JFK: "America/New_York",
  LIS: "Europe/Lisbon",
  NAP: "Europe/Rome",
  KEF: "Atlantic/Reykjavik",
  HAV: "America/Havana",
  // Common transit hubs
  HND: "Asia/Tokyo",   ICN: "Asia/Seoul",
  HKG: "Asia/Hong_Kong", BKK: "Asia/Bangkok", KUL: "Asia/Kuala_Lumpur",
  CDG: "Europe/Paris", ORY: "Europe/Paris",
  AMS: "Europe/Amsterdam", FRA: "Europe/Berlin",
  LHR: "Europe/London", LGW: "Europe/London",
  FCO: "Europe/Rome",  MXP: "Europe/Rome",
  MAD: "Europe/Madrid", BCN: "Europe/Madrid",
  ZRH: "Europe/Zurich",
  CAI: "Africa/Cairo",  JNB: "Africa/Johannesburg",
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne",
  LAX: "America/Los_Angeles", SFO: "America/Los_Angeles",
  ORD: "America/Chicago",
  MIA: "America/New_York", EWR: "America/New_York",
  YYZ: "America/Toronto", GRU: "America/Sao_Paulo", MEX: "America/Mexico_City",
};

/**
 * Convert the CLI's "YYYYMMDDHHmm" wall-clock string (airport-local time) to
 * a UTC ISO instant.
 *
 * Method: parse the wall-clock reading as a naive UTC timestamp, then subtract
 * the zone's UTC offset at that approximated instant. Precision: exact in
 * standard time; ±1 h for flights crossing a DST boundary — sufficient for
 * all constraint checks in the opportunity engine.
 */
function cliTimeToIso(raw: string, airportIata: string): string {
  // "202608251455" → "2026-08-25T14:55:00Z"
  const naive = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:00Z`;
  const zone = AIRPORT_ZONE[airportIata.toUpperCase()];
  if (!zone) return naive; // Unknown airport: treat as UTC
  // offsetMinutes(iso, zone) returns local − UTC in minutes.
  const naiveMs = Date.parse(naive);
  const off = offsetMinutes(naive, zone) * 60_000;
  return new Date(naiveMs - off).toISOString();
}

// ─── CLI response types ───────────────────────────────────────────────────────

interface CliSegment {
  departure_airport: string;
  arrival_airport: string;
  departure_time: string; // "YYYYMMDDHHmm"
  arrival_time: string;
  carrier: string;
  flight_number: string;
  duration_minutes: number;
  cabin_class: number; // 1=economy 2=premium 3=business 4=first
  direction: "outbound" | "inbound";
}

interface CliOffer {
  offer_id: string;
  currency: string;
  total_price: number;
  segments: CliSegment[];
  bookable: boolean;
  price_status: string; // "bookable" | "reference"
}

interface CliEnvelope {
  status: string;
  code: string;
  message: string;
  data: Record<string, unknown>;
  details: Record<string, unknown>;
}

// ─── Offer normalizer ─────────────────────────────────────────────────────────

const CABIN_LABEL: Record<number, string> = {
  1: "economy", 2: "premium_economy", 3: "business", 4: "first",
};

function normalizeCliOffer(raw: CliOffer): NormalizedOffer {
  const out = raw.segments.filter((s) => s.direction === "outbound");
  const inb = raw.segments.filter((s) => s.direction === "inbound");
  const outFirst = out[0];
  const outLast = out[out.length - 1] ?? outFirst;
  const inFirst = inb[0];
  const inLast = inb[inb.length - 1];

  return {
    id: raw.offer_id,
    origin: outFirst.departure_airport,
    destination: outLast.arrival_airport,
    outboundDepartureIso: cliTimeToIso(outFirst.departure_time, outFirst.departure_airport),
    outboundArrivalIso: cliTimeToIso(outLast.arrival_time, outLast.arrival_airport),
    returnDepartureIso: inFirst
      ? cliTimeToIso(inFirst.departure_time, inFirst.departure_airport)
      : undefined,
    returnArrivalIso: inLast
      ? cliTimeToIso(inLast.arrival_time, inLast.arrival_airport)
      : undefined,
    totalPrice: raw.total_price,
    currency: raw.currency,
    bookable: raw.bookable,
    referenceOnly: raw.price_status !== "bookable",
    stops: Math.max(0, out.length - 1),
    source: "ATLAS",
    outboundFlight: outFirst.flight_number,
    returnFlight: inFirst?.flight_number,
    cabin: CABIN_LABEL[outFirst.cabin_class] ?? "economy",
  };
}

// ─── CLI runner helpers ───────────────────────────────────────────────────────

/**
 * Resolve the atlas-flight binary path.
 * Prefers ATLAS_CLI_PATH env var; falls back to the uv default install location;
 * then lets the OS PATH search find it. Node.js child processes do not
 * necessarily inherit the interactive-shell PATH, so the explicit fallback
 * prevents silent "command not found" failures in production.
 */
function resolveAtlasCli(): string {
  if (process.env.ATLAS_CLI_PATH) return process.env.ATLAS_CLI_PATH;
  const uvDefault = join(homedir(), ".local", "bin", "atlas-flight");
  if (existsSync(uvDefault)) return uvDefault;
  return "atlas-flight";
}

const CLI = resolveAtlasCli();

/**
 * IATA codes of every destination in the product catalogue.
 * Used to fan out a no-destination search across all known targets in parallel.
 */
const CATALOGUE_IATA = ["DXB", "NRT", "KIX", "SIN", "JFK", "LIS", "NAP", "KEF", "HAV"] as const;

const execFileAsync = promisify(execFile);

/**
 * Async CLI runner — used for parallel fan-out searches.
 * Returns null (instead of throwing) so Promise.all can continue if one
 * destination fails.
 */
async function runCliAsync(args: string[]): Promise<CliEnvelope | null> {
  try {
    const { stdout } = await execFileAsync(CLI, [...args, "--json"], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    return JSON.parse(stdout) as CliEnvelope;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err) {
      const out = String((err as { stdout?: string }).stdout ?? "").trim();
      if (out) { try { return JSON.parse(out) as CliEnvelope; } catch { /* fall through */ } }
    }
    return null; // Surface as zero results rather than crashing the scan
  }
}

/**
 * Run an atlas-flight subcommand and return the parsed JSON envelope.
 * execFileSync avoids shell injection — args are passed as an array.
 * On non-zero exit the CLI still writes JSON to stdout; we recover it from
 * the Error object before re-throwing as a plain Error.
 */
function runCli(args: string[]): CliEnvelope {
  try {
    const raw = execFileSync(CLI, [...args, "--json"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return JSON.parse(raw) as CliEnvelope;
  } catch (err) {
    if (err && typeof err === "object" && "stdout" in err) {
      const out = String((err as { stdout?: string }).stdout ?? "").trim();
      if (out) {
        try { return JSON.parse(out) as CliEnvelope; } catch { /* fall through */ }
      }
    }
    throw new Error(`Atlas CLI failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Run a CLI command that needs data piped to its standard input.
 * spawnSync feeds the payload without touching shell history or logs.
 */
function runCliWithStdin(args: string[], stdinPayload: string): CliEnvelope {
  const result = spawnSync(CLI, [...args, "--json"], {
    input: stdinPayload,
    encoding: "utf-8",
    timeout: 60_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const out = (result.stdout || result.stderr || "").trim();
  try {
    return JSON.parse(out) as CliEnvelope;
  } catch {
    throw new Error(`Atlas CLI failed: ${result.error?.message ?? "no output received"}`);
  }
}

// ─── Passenger formatting ─────────────────────────────────────────────────────

/**
 * Remap document types used by PassengerProfile to the CLI's two-letter codes.
 * CLI accepts: PP GA TW TB HY
 */
const DOC_TYPE: Record<string, string> = {
  passport: "PP", pp: "PP",
  "chinese resident permit": "GA", ga: "GA",
  "taiwan travel document": "TW", tw: "TW",
  "travel booklet": "TB", tb: "TB",
  "homecoming certificate": "HY", hy: "HY",
};

function toCliDocType(raw: string): string {
  return DOC_TYPE[raw.toLowerCase()] ?? raw.toUpperCase().slice(0, 2);
}

/**
 * Convert a display name to the FAMILY/GIVEN uppercase format the CLI requires.
 * If the name already contains "/" it is already in that format.
 */
function toCliName(fullName: string): string {
  if (fullName.includes("/")) return fullName.toUpperCase();
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return `${parts[0].toUpperCase()}/TRAVELLER`;
  const given = parts.slice(0, -1).join(" ").toUpperCase();
  const family = parts[parts.length - 1].toUpperCase();
  return `${family}/${given}`;
}

// ─── Adapter state ────────────────────────────────────────────────────────────

interface VerifyCtx {
  bookingId: string;
  travelers: Array<{ traveler_id: string; passenger_type: string }>;
}

// ─── SkillAtlasAdapter ────────────────────────────────────────────────────────

/**
 * Atlas adapter that shells out to the locally installed atlas-flight CLI.
 *
 * State kept in two maps across requests (long-lived per the factory contract):
 *   searchCache  — searched offers, so verifyOffer can reconstruct VerifiedOffer
 *                  even if the verify response omits the full segment list.
 *   verifyCache  — booking_id + traveler list returned by offer verify,
 *                  needed when createBooking is called.
 */
export class SkillAtlasAdapter implements AtlasAdapter {
  private readonly searchCache = new Map<string, NormalizedOffer>();
  private readonly verifyCache = new Map<string, VerifyCtx>();

  constructor(private readonly environment: "sandbox" | "production" | "unknown") {}

  // ── getStatus ──────────────────────────────────────────────────────────────

  async getStatus(): Promise<AtlasAccountStatus> {
    try {
      const resp = runCli(["auth", "status"]);
      const d = resp.data;
      const auth = Boolean(d.authenticated);
      const ticketing = Boolean(d.ticketing_available);
      const blocker = typeof d.ticketing_blocker === "string" ? d.ticketing_blocker : null;
      return {
        authorized: auth,
        ticketingAvailable: ticketing,
        environment: this.environment,
        adapter: "skill",
        label: !auth
          ? "Atlas Skill · not authorized"
          : ticketing
            ? "Atlas Skill · live"
            : blocker
              ? `Atlas Skill · ${blocker}`
              : "Atlas Skill · search only",
      };
    } catch {
      return {
        authorized: false,
        ticketingAvailable: false,
        environment: this.environment,
        adapter: "skill",
        label: "Atlas Skill · status unavailable",
      };
    }
  }

  // ── searchFlights ──────────────────────────────────────────────────────────

  async searchFlights(input: FlightSearchInput): Promise<NormalizedOffer[]> {
    // CLI expects YYYY-MM-DD; departureAfter and returnBefore are ISO instants.
    const depart = input.departureAfter.slice(0, 10);
    const ret = input.returnBefore.slice(0, 10);
    const adultsArg = String(Math.max(1, Math.floor(input.adults)));

    const buildArgs = (dest: string) => [
      "search",
      "--origin", input.origin,
      "--destination", dest,
      "--depart", depart,
      "--return-date", ret,
      "--adults", adultsArg,
      // Default to CNY — the constraint layer converts as needed.
      "--currency", "CNY",
    ];

    // When a specific destination was requested, do a single synchronous call.
    // When no destination is given (the typical engine call), fan out across the
    // full catalogue in parallel so the engine can filter and rank across all.
    const responses: Array<CliEnvelope | null> = input.destination
      ? [runCli(buildArgs(input.destination))]
      : await Promise.all(CATALOGUE_IATA.map((d) => runCliAsync(buildArgs(d))));

    const allOffers: NormalizedOffer[] = [];
    for (const resp of responses) {
      if (!resp || resp.code === "SEARCH_NO_RESULTS") continue;
      if (resp.status !== "success") continue;
      const raw = (resp.data.offers as CliOffer[] | undefined) ?? [];
      for (const o of raw) {
        const norm = normalizeCliOffer(o);
        this.searchCache.set(o.offer_id, norm); // Cache for verifyOffer reconstruction
        allOffers.push(norm);
      }
    }
    return allOffers;
  }

  // ── verifyOffer ────────────────────────────────────────────────────────────

  async verifyOffer(offerId: string): Promise<VerifiedOffer> {
    const resp = runCli(["offer", "verify", "--offer-id", offerId]);

    if (resp.status !== "success") {
      // Surface the CLI code so callers can branch on it (e.g. SUBSCRIPTION_REQUIRED)
      throw new Error(`${resp.code}: ${resp.message}`);
    }

    const d = resp.data;
    const bookingId = String(d.booking_id ?? "");
    const travelers = (
      d.travelers as Array<{ traveler_id: string; passenger_type: string }> | undefined
    ) ?? [];
    this.verifyCache.set(offerId, { bookingId, travelers });

    // Reconstruct VerifiedOffer: use updated price from verify, segments from cache.
    const cached = this.searchCache.get(offerId);
    const price = typeof d.current_price === "number" ? d.current_price : (cached?.totalPrice ?? 0);
    const currency = typeof d.currency === "string" ? d.currency : (cached?.currency ?? "CNY");
    const bookable = d.bookable !== false;

    const segments = d.segments as CliSegment[] | undefined;
    const base: NormalizedOffer = segments
      ? normalizeCliOffer({ offer_id: offerId, currency, total_price: price, segments, bookable, price_status: "bookable" })
      : cached
        ? { ...cached, totalPrice: price, currency, bookable, referenceOnly: false }
        : {
            id: offerId, origin: "", destination: "",
            outboundDepartureIso: "", outboundArrivalIso: "",
            totalPrice: price, currency, bookable, referenceOnly: false,
            stops: 0, source: "ATLAS" as const,
          };

    return { ...base, verifiedAtIso: new Date().toISOString() };
  }

  // ── createBooking ──────────────────────────────────────────────────────────

  async createBooking(input: BookingInput): Promise<BookingResult> {
    const testMode = this.environment === "sandbox";
    const ctx = this.verifyCache.get(input.offer.id);
    if (!ctx?.bookingId) {
      return { state: "failed", testMode, rawStatusLabel: "Offer not verified — booking_id unavailable" };
    }

    const passenger = input.passenger;
    if (!passenger) {
      return { state: "failed", testMode, rawStatusLabel: "Passenger profile required for live booking" };
    }

    const travelerId = ctx.travelers[0]?.traveler_id ?? "traveler-1";
    const passengerType = ctx.travelers[0]?.passenger_type ?? "adult";
    const name = toCliName(passenger.fullName);

    // Build the one-time passenger payload per passenger-input.md.
    // Personal data is piped to stdin only; it never enters a log, arg list, or prompt.
    const payload = JSON.stringify({
      passengers: [{
        traveler_id: travelerId,
        name,
        passenger_type: passengerType,
        gender: passenger.gender.charAt(0).toUpperCase(),
        birthday: passenger.dateOfBirth,
        nationality: passenger.nationality,
        document: {
          type: toCliDocType(passenger.documentType),
          number: passenger.documentNumber,
          issuing_country: passenger.issuingCountry,
          expires: passenger.documentExpiry,
        },
      }],
      contact: { name },
    });

    const resp = runCliWithStdin(
      ["order", "create", "--booking-id", ctx.bookingId, "--passengers-stdin"],
      payload,
    );

    // PAYMENT_CONFIRMATION_REQUIRED is the expected success path for the CLI
    if (resp.status !== "success" && resp.code !== "PAYMENT_CONFIRMATION_REQUIRED") {
      return { state: "failed", testMode, rawStatusLabel: `Order creation failed: ${resp.code}` };
    }

    const d = resp.data;
    const orderNo = typeof d.order_no === "string" ? d.order_no : undefined;
    const payConfId = typeof d.payment_confirmation_id === "string" ? d.payment_confirmation_id : undefined;

    return {
      reference: orderNo ?? payConfId,
      state: "pending",
      testMode,
      rawStatusLabel: resp.message || "Booking requested · awaiting payment confirmation",
    };
  }

  // ── getBookingStatus ───────────────────────────────────────────────────────

  async getBookingStatus(reference: string): Promise<BookingResult> {
    const testMode = this.environment === "sandbox";
    const resp = runCli(["order", "status", "--order-no", reference]);
    const d = resp.data;

    if (resp.code === "TICKETED") {
      return {
        reference,
        state: "confirmed",
        testMode,
        rawStatusLabel: testMode ? "Sandbox ticket issued" : "Trip confirmed",
        pnr: typeof d.pnr === "string" ? d.pnr : undefined,
        ticketNumber: typeof d.ticket_number === "string" ? d.ticket_number : undefined,
      };
    }

    if (resp.code === "TICKETING_PENDING") {
      return { reference, state: "pending", testMode, rawStatusLabel: "Awaiting airline confirmation" };
    }

    if (resp.code === "ORDER_NOT_FOUND" || resp.status === "error") {
      return { reference, state: "failed", testMode, rawStatusLabel: `Status: ${resp.code}` };
    }

    return { reference, state: "pending", testMode, rawStatusLabel: resp.message || "Booking pending" };
  }
}
