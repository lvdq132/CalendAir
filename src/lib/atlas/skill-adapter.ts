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
 *
 * Measured reliability (see README's "Live Atlas search, measured" and
 * AGENT_HANDOFF.md — do not restate a single-sample rate here, it will rot):
 * a 12-call sequential sample returned 12/12 success, and a separate
 * sequential 9-destination catalogue scan returned 7/9 success with 2
 * `SERVICE_TEMPORARILY_UNAVAILABLE` from the provider. Separately, and this
 * is the fix in SEARCH_FANOUT_CONCURRENCY below: running the same 9-destination
 * scan as `Promise.all` (fully parallel) produced 5/9 `SECURE_STORE_UNAVAILABLE`
 * failures, twice in a row — that is *our* concurrent-process contention on the
 * macOS Keychain the CLI reads its token from (see atlas_cli/secure_store.py in
 * the installed tool), not a provider problem, and it disappears at
 * concurrency 1.
 */

import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AtlasAdapter } from "./adapter";
import { AtlasProviderUnavailableError } from "./adapter";
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
  price_status: string; // Observed: "current" | "bookable" | "reference"
}

interface CliEnvelope {
  status: string;
  code: string;
  message: string;
  data: Record<string, unknown>;
  details: Record<string, unknown>;
  /**
   * Present on `{status:"retryable_error"}` envelopes, e.g.
   * `SERVICE_TEMPORARILY_UNAVAILABLE`. Observed live, occasionally, and a
   * bare retry a moment later succeeds — see withRetry below and the measured
   * rates in this file's header comment. Not a fixed one-in-three rate; that
   * figure came from a 3-call sample and did not hold up under more calls.
   */
  retryable?: boolean;
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
    // Observed live Atlas values include `current` for a genuinely bookable
    // fare. Treat only the provider's explicit reference state (or a false
    // bookable flag) as comparison-only; the old `!== "bookable"` check
    // incorrectly downgraded every `current` live offer to an unusable quote.
    referenceOnly: !raw.bookable || raw.price_status === "reference",
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
 * Used to fan out a no-destination search across all known targets, bounded
 * by SEARCH_FANOUT_CONCURRENCY below — not truly "in parallel" any more; see
 * that constant's comment for why.
 */
const CATALOGUE_IATA = ["DXB", "NRT", "KIX", "SIN", "JFK", "LIS", "NAP", "KEF", "HAV"] as const;

/**
 * Concurrency cap for the catalogue-wide search fan-out.
 *
 * Root cause (confirmed against the real CLI, not guessed): `atlas-flight`
 * stores its auth token in the OS keyring (macOS Keychain via Python
 * `keyring` — see `atlas_cli/secure_store.py` in the installed tool).
 * Launching all 9 catalogue searches at once as concurrent child processes
 * makes them contend on that keychain read, and some lose and come back
 * `{status:"terminal_error", code:"SECURE_STORE_UNAVAILABLE", retryable:false}`
 * — a fact about our own process fan-out, not about flight availability or
 * the provider.
 *
 * Measured against the real CLI, same 9 destinations, same dates, two full
 * runs at each concurrency level:
 *
 *   unbounded (Promise.all)  5/9 and 5/9 SECURE_STORE_UNAVAILABLE
 *   concurrency 3            1/9 and 1/9
 *   concurrency 2            1/9 and 1/9
 *   concurrency 1            0/9 and 0/9   (two more runs, still 0/9 and 0/9)
 *
 * Only concurrency 1 was clean across every run tried. The cost is latency:
 * a full 9-destination scan takes roughly 42-48s sequentially (each
 * `atlas-flight search` call is itself ~2-20s), versus ~3-8s when it was
 * silently losing half its destinations to keyring contention. Slower and
 * correct beats fast and wrong for this product's own safety bar — a scan
 * that drops 5 of 9 destinations without saying so is exactly the kind of
 * confident-but-false result CALENDAIR exists not to produce.
 */
const SEARCH_FANOUT_CONCURRENCY = 1;

/**
 * How many catalogue destinations a LIVE scan searches.
 *
 * Serialising the fan-out (above) fixed the keychain contention, but it traded
 * a few seconds for ~45-51s across all nine destinations, because each CLI
 * invocation is now strictly sequential. That is too slow to sit through in a
 * judged demo, and it buys little: the point of a live scan is to prove the
 * Atlas integration is real, not to exhaustively price every destination in
 * the catalogue. The deterministic demo adapter remains the path that shows
 * the full nine-destination comparison instantly.
 *
 * So a live scan searches a bounded prefix of the catalogue by default —
 * roughly 5s per destination. Raise it with ATLAS_LIVE_DESTINATION_LIMIT (0 or
 * a negative value means "all"), and expect the latency to scale linearly.
 * A caller that names an explicit destination is unaffected.
 */
const DEFAULT_LIVE_DESTINATION_LIMIT = 3;

function liveDestinationLimit(): number {
  const raw = process.env.ATLAS_LIVE_DESTINATION_LIMIT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_LIVE_DESTINATION_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIVE_DESTINATION_LIMIT;
  // 0 or negative means "search the whole catalogue".
  return parsed <= 0 ? CATALOGUE_IATA.length : Math.min(parsed, CATALOGUE_IATA.length);
}

/**
 * Run `fn` over `items`, at most `limit` in flight at once, preserving
 * output order. Written inline rather than adding a dependency for one
 * small utility — this is the entire implementation: a fixed pool of
 * `limit` workers each pulling the next index off a shared cursor.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Manual promisification of `execFile`, kept separate from `node:util`'s
 * `promisify` on purpose: `execFile` carries a special
 * `util.promisify.custom` implementation that resolves `{ stdout, stderr }`,
 * which a test double for the plain callback-style import would also have to
 * replicate. Hand-rolling this wrapper means a unit test can mock `execFile`
 * as an ordinary Node-style callback function and nothing more.
 */
function execFileP(
  cmd: string,
  args: string[],
  options: { timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "utf-8", ...options }, (err, stdout, stderr) => {
      if (err) {
        // Node attaches these to exec/execFile errors natively; set them
        // explicitly too so the behaviour does not depend on that.
        Object.assign(err, { stdout, stderr });
        reject(err);
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });
}

// ─── Retry policy ──────────────────────────────────────────────────────────

/**
 * Bounded retry for the Atlas CLI.
 *
 * Observed live: `atlas-flight search --json` occasionally returns
 * `{status:"retryable_error", code:"SERVICE_TEMPORARILY_UNAVAILABLE", retryable:true}`,
 * and a bare retry a moment later usually succeeds — see this file's header
 * comment and README's "Live Atlas search, measured" for the actual sample
 * sizes (a 12-call sequential run was 12/12, a 9-destination sequential scan
 * saw 2 of these). A transient provider hiccup and a genuine zero-result
 * answer are different facts and must never collapse into the same "no
 * flights" outcome — see AtlasProviderUnavailableError — so every CLI call
 * gets a bounded number of attempts, with exponential backoff plus jitter,
 * before the caller gives up and reports the failure honestly instead of
 * silently downgrading it.
 *
 * Kept as module constants rather than inline numbers so the policy is one
 * place to read, and one place to tune.
 */
const RETRY_MAX_ATTEMPTS = 3; // total attempts, including the first — not just retries
const RETRY_BASE_DELAY_MS = 300; // backoff before the 2nd attempt; doubles each attempt after
const RETRY_MAX_DELAY_MS = 3_000; // backoff never grows past this
const RETRY_JITTER_MS = 200; // random jitter added to every backoff, so a parallel fan-out doesn't retry in lockstep
const RETRY_TOTAL_CEILING_MS = 20_000; // cumulative *backoff* time for one logical call — does NOT bound attempt/execFile time, see CALL_WALL_CLOCK_BUDGET_MS
const ATTEMPT_TIMEOUT_MS = 30_000; // ceiling on any single execFile attempt
/**
 * Wall-clock ceiling for one *logical* call — every attempt plus every
 * backoff sleep combined. RETRY_TOTAL_CEILING_MS above bounds only the time
 * spent sleeping between retries; on its own it does nothing to stop a
 * slow-but-not-dead provider, because each of up to RETRY_MAX_ATTEMPTS
 * attempts can independently run for up to ATTEMPT_TIMEOUT_MS (30s) — up to
 * ~91s for one call, and searchFlights fans that out across 9 destinations
 * in parallel, so a scan could hang for a minute and a half. A deadline
 * computed once per logical call and threaded down as the per-attempt
 * execFile timeout closes that: no attempt can run past the deadline, and no
 * further attempt starts once it has passed.
 */
const CALL_WALL_CLOCK_BUDGET_MS = 30_000;

/**
 * The one deliberate override of the CLI's own `retryable` flag.
 *
 * Every other terminal code is trusted exactly as the CLI reports it — that
 * is the whole point of branching on `code`/`retryable` instead of guessing
 * (see the Skill contract, error-handling.md: "SECURE_STORE_UNAVAILABLE —
 * report that secure local storage is unavailable and stop"). That guidance
 * is correct in general: an agent that cannot read this host's keyring at
 * all has no business retrying.
 *
 * But this app confirmed, by direct measurement (see SEARCH_FANOUT_CONCURRENCY
 * above), that on THIS host `SECURE_STORE_UNAVAILABLE` is not "the keyring is
 * broken" — it is transient contention from our own concurrent CLI
 * invocations losing a race on the same macOS Keychain entry. The store is
 * available; it was momentarily locked by a sibling process. A brief backoff
 * (the same withRetry policy as any other retryable code, still bounded by
 * RETRY_MAX_ATTEMPTS) resolves that race, whereas honouring `retryable:false`
 * here — even after switching the fan-out to concurrency 1 above — would
 * still fail the odd request that happens to race an auth-status check or a
 * second adapter instance. No other non-retryable code gets this treatment:
 * SUBSCRIPTION_REQUIRED, ORDER_NOT_FOUND and everything else terminal stay
 * exactly as terminal as the CLI says, because those really do mean "no",
 * not "ask again".
 */
const LOCALLY_RETRYABLE_CODES = new Set(["SECURE_STORE_UNAVAILABLE"]);

function isRetryableEnvelope(envelope: CliEnvelope | null): boolean {
  if (!envelope) return true; // no parseable JSON at all — a process-level failure, worth a retry
  if (envelope.retryable === true || envelope.status === "retryable_error") return true;
  if (envelope.code && LOCALLY_RETRYABLE_CODES.has(envelope.code)) return true;
  return false;
}

function backoffDelayMs(attemptIndex: number): number {
  const exp = Math.min(RETRY_BASE_DELAY_MS * 2 ** attemptIndex, RETRY_MAX_DELAY_MS);
  return exp + Math.random() * RETRY_JITTER_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `attempt(timeoutMs)` up to `maxAttempts` times, backing off between
 * retryable failures (see isRetryableEnvelope). `timeoutMs` is recomputed
 * before every attempt from a deadline set once at the start of the call —
 * `Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now())` — so no single
 * attempt can push the logical call past CALL_WALL_CLOCK_BUDGET_MS, and no
 * further attempt starts once the deadline has passed. Also still stops
 * early once RETRY_TOTAL_CEILING_MS of cumulative backoff has elapsed.
 * Returns whatever the last attempt produced — success, a non-retryable
 * error envelope (e.g. SUBSCRIPTION_REQUIRED — retrying that would just
 * waste the budget), a still-retryable envelope if every attempt flaked or
 * the deadline was reached, or null if no attempt ever produced parseable
 * JSON.
 */
async function withRetry(
  attempt: (timeoutMs: number) => Promise<CliEnvelope | null>,
  maxAttempts: number = RETRY_MAX_ATTEMPTS,
): Promise<CliEnvelope | null> {
  const startedAt = Date.now();
  const deadline = startedAt + CALL_WALL_CLOCK_BUDGET_MS;
  const timeoutForNextAttempt = () => Math.min(ATTEMPT_TIMEOUT_MS, Math.max(0, deadline - Date.now()));

  let result = await attempt(timeoutForNextAttempt());
  let tries = 1;
  while (isRetryableEnvelope(result) && tries < maxAttempts) {
    if (Date.now() - startedAt >= RETRY_TOTAL_CEILING_MS) break;
    if (Date.now() >= deadline) break; // wall-clock budget for this logical call is exhausted
    await sleep(backoffDelayMs(tries - 1));
    if (Date.now() >= deadline) break;
    result = await attempt(timeoutForNextAttempt());
    tries += 1;
  }
  return result;
}

// ─── CLI runner helpers ───────────────────────────────────────────────────────

/**
 * One CLI attempt — no retry. Returns null (instead of throwing) on any
 * process-level failure, so withRetry / Promise.all can treat "no response"
 * uniformly with a retryable envelope. `timeoutMs` is the deadline-aware
 * per-attempt ceiling computed by withRetry — see CALL_WALL_CLOCK_BUDGET_MS.
 */
async function runCliOnce(args: string[], timeoutMs: number = ATTEMPT_TIMEOUT_MS): Promise<CliEnvelope | null> {
  try {
    const { stdout } = await execFileP(CLI, [...args, "--json"], { timeout: timeoutMs });
    return JSON.parse(stdout) as CliEnvelope;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err) {
      const out = String((err as { stdout?: string }).stdout ?? "").trim();
      if (out) { try { return JSON.parse(out) as CliEnvelope; } catch { /* fall through */ } }
    }
    return null;
  }
}

/**
 * Retrying CLI runner — used for the parallel search fan-out. Returns null
 * only once every attempt has failed to produce parseable JSON at all;
 * Promise.all can still continue if one destination is truly unreachable
 * (see searchFlights, which distinguishes that from a clean zero-result
 * destination).
 */
async function runCliAsync(args: string[]): Promise<CliEnvelope | null> {
  return withRetry((timeoutMs) => runCliOnce(args, timeoutMs));
}

/**
 * Retrying CLI runner for the single-request methods (getStatus, verifyOffer,
 * getBookingStatus — all read-only and safe to retry, though verifyOffer is
 * not read-only in its side effects — see the class doc comment below).
 * Throws only when no attempt ever produced a parseable envelope, and throws
 * AtlasProviderUnavailableError specifically: "nothing parseable came back
 * after every retry" is exactly the same "we don't know, not a no" fact as
 * an exhausted retryable_error envelope (see AtlasProviderUnavailableError),
 * so callers that branch on that type (e.g. flow.ts's reverify) must see it
 * regardless of which shape the exhaustion took. A well-formed error
 * envelope (even a hard failure like SUBSCRIPTION_REQUIRED, or an exhausted
 * retryable_error) is returned as-is so callers can branch on
 * resp.status / resp.code exactly as before.
 */
async function runCliRetrying(args: string[]): Promise<CliEnvelope> {
  const resp = await withRetry((timeoutMs) => runCliOnce(args, timeoutMs));
  if (!resp) {
    throw new AtlasProviderUnavailableError(
      `Atlas CLI failed: no parseable response after ${RETRY_MAX_ATTEMPTS} attempts`,
    );
  }
  return resp;
}

/**
 * Run a CLI command that needs data piped to its standard input.
 * spawnSync feeds the payload without touching shell history or logs.
 *
 * Deliberately NOT retried: this is used only by createBooking ("order
 * create"), which is not idempotent. Blindly retrying a create call on a
 * transient failure risks creating a duplicate order — the one thing this
 * product must never do by accident. A failure here is surfaced once, as-is,
 * and the human checkpoint in flow.ts decides what happens next.
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
      const resp = await runCliRetrying(["auth", "status"]);
      const d = resp.data;
      const auth = Boolean(d.authenticated);
      const ticketing = Boolean(d.ticketing_available);
      const blocker = typeof d.ticketing_blocker === "string" ? d.ticketing_blocker : undefined;
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
        // Each capability's provenance reflects what this call actually
        // proved, not the adapter's aspiration. `auth` is required for a
        // live search to succeed; `ticketing` is the CLI's own
        // ticketing_available bit. Reporting "live" for a capability that
        // verifiably cannot execute a single call (e.g. this account today:
        // ticketing_available: false, TICKETING_ACTIVATION_REQUIRED) is
        // exactly the false "live" claim /api/health and /demo exist to
        // prevent.
        provenance: {
          search: auth ? "live" : "unavailable",
          ticketing: ticketing ? "live" : "unavailable",
        },
        ticketingBlockedReason: blocker,
      };
    } catch {
      return {
        authorized: false,
        ticketingAvailable: false,
        environment: this.environment,
        adapter: "skill",
        label: "Atlas Skill · status unavailable",
        // The CLI never answered at all — neither capability was proven live.
        provenance: { search: "unavailable", ticketing: "unavailable" },
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

    // A specific destination still goes through the same retrying runner as
    // the full fan-out — a single-destination request that flakes deserves
    // the same bounded retry as any other, not a silent zero-result.
    const destinations: string[] = input.destination
      ? [input.destination]
      : [...CATALOGUE_IATA].slice(0, liveDestinationLimit());
    const responses = await mapWithConcurrency(destinations, SEARCH_FANOUT_CONCURRENCY, (dest) =>
      runCliAsync(buildArgs(dest)),
    );

    const allOffers: NormalizedOffer[] = [];
    // One entry per destination that never produced a trustworthy answer
    // after up to RETRY_MAX_ATTEMPTS attempts — whether the CLI marked the
    // failure retryable (e.g. SERVICE_TEMPORARILY_UNAVAILABLE), or it is the
    // one code this adapter retries despite the CLI saying retryable:false
    // (SECURE_STORE_UNAVAILABLE — see LOCALLY_RETRYABLE_CODES above), or
    // every attempt still came back retryable/unresolved past the retry
    // budget — as opposed to a destination that cleanly reported
    // SEARCH_NO_RESULTS, which is a genuine fact, not a failure.
    const unresolved: string[] = [];

    responses.forEach((resp, i) => {
      const dest = destinations[i];
      if (resp?.status === "success") {
        const raw = (resp.data.offers as CliOffer[] | undefined) ?? [];
        for (const o of raw) {
          const norm = normalizeCliOffer(o);
          this.searchCache.set(o.offer_id, norm); // Cache for verifyOffer reconstruction
          allOffers.push(norm);
        }
        return;
      }
      if (resp?.code === "SEARCH_NO_RESULTS") return; // genuine zero results for this destination

      unresolved.push(
        resp ? `${dest}: ${resp.code || resp.status} — ${resp.message}` : `${dest}: no response from atlas-flight`,
      );
    });

    // Zero offers plus at least one destination we simply could not reach is
    // a provider outage, not a market with nothing in it — see
    // AtlasProviderUnavailableError and BookingState "PROVIDER_UNAVAILABLE".
    // A partial fan-out failure alongside real offers from other
    // destinations still produces a legitimate (if incomplete) result, so
    // this only throws when there is nothing at all to show for the search.
    if (allOffers.length === 0 && unresolved.length > 0) {
      throw new AtlasProviderUnavailableError(
        `Atlas search did not return a trustworthy answer for ${unresolved.length} of ` +
          `${destinations.length} destination(s): ${unresolved.join("; ")}`,
      );
    }

    return allOffers;
  }

  // ── verifyOffer ────────────────────────────────────────────────────────────

  async verifyOffer(offerId: string): Promise<VerifiedOffer> {
    const resp = await runCliRetrying(["offer", "verify", "--offer-id", offerId]);

    if (resp.status !== "success") {
      // An envelope that is still `retryable_error` after every attempt is
      // the provider not answering, not a terminal refusal — the same
      // "unknown, not a no" fact as the exhausted-retry case in
      // runCliRetrying above (both, in fact, mean "we don't know yet").
      // Callers (flow.ts's reverify) must be able to tell that apart from a
      // genuine terminal error like SUBSCRIPTION_REQUIRED, which really does
      // mean "no" and should still stop for a human decision with its real
      // reason. Surface the CLI code either way so the message stays honest.
      if (resp.status === "retryable_error") {
        throw new AtlasProviderUnavailableError(`${resp.code}: ${resp.message}`);
      }
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
    const resp = await runCliRetrying(["order", "status", "--order-no", reference]);
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

    // Only an explicit "the order does not exist" is a real failure. `status
    // === "error"` is the CLI's catch-all bucket for any non-retryable
    // error — including a transient failure of the status check itself
    // (e.g. SECURE_STORE_UNAVAILABLE, observed live) that says nothing about
    // whether the order or ticket exists. Asserting "failed" on that bucket
    // would be the same false-negative failure mode as calling a 200 OK
    // "confirmed": real money, a real order in progress, and the UI saying
    // it never happened. Everything that is not a confirmed state and not an
    // explicit "not found" is "unknown — ask again", which pollFulfilment's
    // own catch (a transport-level failure) already handles the same way.
    if (resp.code === "ORDER_NOT_FOUND") {
      return { reference, state: "failed", testMode, rawStatusLabel: `Status: ${resp.code}` };
    }

    return { reference, state: "pending", testMode, rawStatusLabel: resp.message || "Booking pending" };
  }
}

// ─── Host-level CLI presence (task 3) ──────────────────────────────────────

export interface AtlasCliHostCheck {
  /** Whether the `atlas-flight` binary could actually be executed on this host, at all. */
  present: boolean;
  /** The resolved path this process would invoke — see resolveAtlasCli() above. */
  path: string;
  version: string | null;
  /** null means "could not be determined" (e.g. the CLI isn't present), never a guessed false. */
  authorized: boolean | null;
  ticketingAvailable: boolean | null;
  checkedAt: string;
}

/**
 * Ground truth about the Atlas CLI on THIS host, independent of
 * `ATLAS_INTEGRATION_MODE`.
 *
 * This exists because the mode env var only says which adapter code path is
 * *selected* — it says nothing about whether the `atlas-flight` binary can
 * actually run here, or whether it has been through the interactive
 * `atlas-flight auth login` browser flow on this specific machine (its
 * credential lives in this host's OS keyring; see skill-adapter.ts's header
 * comment and the "cannot run in a deployed runtime" section of the README).
 * A deployed instance with `ATLAS_INTEGRATION_MODE=skill` set but no CLI
 * installed, or a CLI that has never been authorized on that host, must not
 * report "configured" — /api/health calls this directly, for every mode,
 * so that gap can never hide behind a healthy-looking env var.
 *
 * Uses only commands the Skill contract explicitly sanctions for this
 * purpose — `atlas-flight --version` (without `--json`, per the contract)
 * and `atlas-flight auth status --json` — never a guessed or invented flag.
 */
export function checkAtlasCliOnHost(): AtlasCliHostCheck {
  const checkedAt = new Date().toISOString();
  const base = { path: CLI, checkedAt };

  let versionResult: ReturnType<typeof spawnSync>;
  try {
    // turbopackIgnore: CLI resolves to an on-PATH or fixed-directory binary
    // at runtime (see resolveAtlasCli() above), never a path inside this
    // app's own source — it must not make the bundler trace and ship the
    // whole project as a false-positive "this file might be read".
    versionResult = spawnSync(/* turbopackIgnore: true */ CLI, ["--version"], { encoding: "utf-8", timeout: 5_000 });
  } catch {
    return { ...base, present: false, version: null, authorized: null, ticketingAvailable: null };
  }
  if (versionResult.error || versionResult.status !== 0) {
    return { ...base, present: false, version: null, authorized: null, ticketingAvailable: null };
  }
  const version = String(versionResult.stdout || "").trim() || null;

  let authorized: boolean | null = null;
  let ticketingAvailable: boolean | null = null;
  try {
    const authResult = spawnSync(/* turbopackIgnore: true */ CLI, ["auth", "status", "--json"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    const out = String(authResult.stdout || authResult.stderr || "").trim();
    const env = JSON.parse(out) as CliEnvelope;
    authorized = Boolean(env.data?.authenticated);
    ticketingAvailable = Boolean(env.data?.ticketing_available);
  } catch {
    // Leave as null — "could not be determined right now" is honest;
    // guessing `false` would claim a fact this check never established.
  }

  return { ...base, present: true, version, authorized, ticketingAvailable };
}
