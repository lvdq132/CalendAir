import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests mock `node:child_process`'s `execFile` directly — the plain
 * Node callback API — rather than hitting the real atlas-flight CLI. That
 * exercises exactly what skill-adapter.ts's `execFileP` wrapper calls, so the
 * retry/backoff logic under test is the real logic, not a re-implementation
 * of it in the test.
 *
 * Each queued response corresponds to one CLI invocation, consumed in call
 * order (child_process invocations happen synchronously up to their first
 * await, so for a parallel fan-out the first attempt of every destination is
 * consumed in the order runOpportunityEngine issues them — see the
 * "partial fan-out" test below for why that matters).
 */

interface QueuedResponse {
  status?: string;
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
  retryable?: boolean;
  /** Simulate a process-level failure with nothing parseable on stdout. */
  processFailure?: boolean;
}

let queue: QueuedResponse[] = [];
/**
 * Optional per-destination queues, keyed by the `--destination` arg. When
 * set, the mock consumes from the matching destination's own queue instead
 * of the single shared FIFO `queue` — this is what lets a fan-out test
 * (multiple destinations dispatched in parallel) assert per-destination
 * behaviour without depending on CATALOGUE_IATA's order or on exactly how
 * the JS event loop happens to interleave `Promise.all`'s dispatch. `null`
 * (the default) keeps the simpler shared-queue behaviour for single-
 * destination tests.
 */
let destinationQueues: Record<string, QueuedResponse[]> | null = null;
const execFileCalls: string[][] = [];

function destinationArg(args: string[]): string | undefined {
  const i = args.indexOf("--destination");
  return i >= 0 ? args[i + 1] : undefined;
}

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    args: string[],
    _options: unknown,
    callback: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void,
  ) => {
    execFileCalls.push(args);
    const next = destinationQueues
      ? destinationQueues[destinationArg(args) ?? ""]?.shift()
      : queue.shift();
    if (!next || next.processFailure) {
      callback(Object.assign(new Error("atlas-flight: connection reset"), { stdout: "", stderr: "" }), "", "");
      return;
    }
    const body = JSON.stringify({
      status: next.status ?? "success",
      code: next.code ?? "OK",
      message: next.message ?? "",
      data: next.data ?? {},
      details: {},
      ...(next.retryable !== undefined ? { retryable: next.retryable } : {}),
    });
    callback(null, body, "");
  },
  spawnSync: vi.fn(),
}));

const { SkillAtlasAdapter, mapWithConcurrency } = await import("./skill-adapter");
const { AtlasProviderUnavailableError } = await import("./adapter");

function searchInput(destination: string) {
  return {
    origin: "LON",
    destination,
    departureAfter: "2026-09-18T00:00:00.000Z",
    returnBefore: "2026-09-21T00:00:00.000Z",
    adults: 1,
  };
}

function offerEnvelope(id: string, priceStatus = "bookable"): QueuedResponse {
  return {
    status: "success",
    code: "FLIGHT_SEARCHED",
    data: {
      offers: [
        {
          offer_id: id,
          currency: "GBP",
          total_price: 250,
          bookable: true,
          price_status: priceStatus,
          segments: [
            {
              departure_airport: "LON",
              arrival_airport: "BCN",
              departure_time: "202609180800",
              arrival_time: "202609181100",
              carrier: "BA",
              flight_number: "BA123",
              duration_minutes: 180,
              cabin_class: 1,
              direction: "outbound",
            },
          ],
        },
      ],
    },
  };
}

const RETRYABLE: QueuedResponse = {
  status: "retryable_error",
  code: "SERVICE_TEMPORARILY_UNAVAILABLE",
  message: "Flight search temporarily unavailable",
  retryable: true,
};

beforeEach(() => {
  queue = [];
  destinationQueues = null;
  execFileCalls.length = 0;
});

describe("SkillAtlasAdapter — retry with backoff (task 1)", () => {
  it("keeps a provider-bookable `current` live fare out of the reference-only bucket", async () => {
    queue.push(offerEnvelope("OFR-CURRENT", "current"));
    const adapter = new SkillAtlasAdapter("sandbox");

    const offers = await adapter.searchFlights(searchInput("BCN"));

    expect(offers).toHaveLength(1);
    expect(offers[0].bookable).toBe(true);
    expect(offers[0].referenceOnly).toBe(false);
  });

  it("retries a retryable_error and returns real offers once the CLI recovers", async () => {
    queue.push(RETRYABLE, RETRYABLE, offerEnvelope("OFR-1"));
    const adapter = new SkillAtlasAdapter("sandbox");

    const offers = await adapter.searchFlights(searchInput("BCN"));

    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe("OFR-1");
    expect(execFileCalls).toHaveLength(3); // 2 failed attempts + 1 success
  }, 10_000);

  it("gives up after a bounded number of attempts rather than retrying forever", async () => {
    queue.push(RETRYABLE, RETRYABLE, RETRYABLE, RETRYABLE, RETRYABLE);
    const adapter = new SkillAtlasAdapter("sandbox");

    await expect(adapter.searchFlights(searchInput("BCN"))).rejects.toBeInstanceOf(
      AtlasProviderUnavailableError,
    );
    // Exactly RETRY_MAX_ATTEMPTS (3), not all 5 queued failures.
    expect(execFileCalls).toHaveLength(3);
  }, 10_000);

  it("does NOT retry a terminal, explicitly non-retryable error that isn't the local-contention special case (e.g. SUBSCRIPTION_REQUIRED)", async () => {
    queue.push(
      { status: "error", code: "SUBSCRIPTION_REQUIRED", message: "Ticketing is not active for this account", retryable: false },
      offerEnvelope("OFR-SHOULD-NOT-BE-REACHED"),
    );
    const adapter = new SkillAtlasAdapter("sandbox");

    // A single unresolved destination with zero offers still surfaces as a
    // provider-unavailable outcome (see searchFlights) — what this test
    // actually pins is that the CLI's own retryable:false was honoured for a
    // code that is NOT SECURE_STORE_UNAVAILABLE: only one attempt was made,
    // and the second queued response (which would have produced a real
    // offer) was never consumed. Blanket-retrying every terminal code would
    // be exactly the "second-guessing the provider" this adapter otherwise
    // refuses to do.
    await expect(adapter.searchFlights(searchInput("BCN"))).rejects.toBeInstanceOf(
      AtlasProviderUnavailableError,
    );
    expect(execFileCalls).toHaveLength(1);
  });

  it("DOES retry SECURE_STORE_UNAVAILABLE despite retryable:false — the one deliberate override, because it is measured local keychain contention, not a real terminal refusal (task 1)", async () => {
    queue.push(
      { status: "error", code: "SECURE_STORE_UNAVAILABLE", message: "secure store unavailable", retryable: false },
      offerEnvelope("OFR-RECOVERED"),
    );
    const adapter = new SkillAtlasAdapter("sandbox");

    const offers = await adapter.searchFlights(searchInput("BCN"));

    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe("OFR-RECOVERED");
    expect(execFileCalls).toHaveLength(2); // 1 failed attempt + 1 successful retry

    execFileCalls.length = 0;
    queue = [
      { status: "error", code: "SECURE_STORE_UNAVAILABLE", message: "secure store unavailable", retryable: false },
      { status: "error", code: "SECURE_STORE_UNAVAILABLE", message: "secure store unavailable", retryable: false },
      { status: "error", code: "SECURE_STORE_UNAVAILABLE", message: "secure store unavailable", retryable: false },
    ];
    const adapter2 = new SkillAtlasAdapter("sandbox");
    // Still bounded by RETRY_MAX_ATTEMPTS — a special case for the CODE,
    // never an unbounded retry loop.
    await expect(adapter2.searchFlights(searchInput("BCN"))).rejects.toBeInstanceOf(
      AtlasProviderUnavailableError,
    );
    expect(execFileCalls).toHaveLength(3);
  }, 10_000);

  it("also retries a bare process-level failure (no parseable JSON at all)", async () => {
    queue.push({ processFailure: true }, offerEnvelope("OFR-2"));
    const adapter = new SkillAtlasAdapter("sandbox");

    const offers = await adapter.searchFlights(searchInput("DXB"));

    expect(offers).toHaveLength(1);
    expect(execFileCalls).toHaveLength(2);
  }, 10_000);
});

describe("SkillAtlasAdapter — provider failure vs genuine no-results (task 2)", () => {
  it("throws AtlasProviderUnavailableError — NOT an empty offers array — once retries are exhausted", async () => {
    queue.push(RETRYABLE, RETRYABLE, RETRYABLE);
    const adapter = new SkillAtlasAdapter("sandbox");

    let threw = false;
    try {
      await adapter.searchFlights(searchInput("BCN"));
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(AtlasProviderUnavailableError);
      expect((err as Error).message).toMatch(/SERVICE_TEMPORARILY_UNAVAILABLE/);
    }
    expect(threw).toBe(true);
  }, 10_000);

  it("treats a clean SEARCH_NO_RESULTS as a genuine empty answer, never a failure", async () => {
    queue.push({ status: "success", code: "SEARCH_NO_RESULTS", data: {} });
    const adapter = new SkillAtlasAdapter("sandbox");

    const offers = await adapter.searchFlights(searchInput("BCN"));

    expect(offers).toEqual([]);
    expect(execFileCalls).toHaveLength(1); // no retry for a clean, non-retryable answer
  });

  it("returns the offers it did find instead of throwing when only some destinations are unreachable", async () => {
    // Full catalogue fan-out (no destination given): DXB succeeds, NRT flakes
    // out completely (3 exhausted attempts), the rest cleanly report
    // SEARCH_NO_RESULTS. A partial provider outage must not erase a real,
    // already-found recommendation.
    //
    // Keyed by --destination rather than a single order-dependent FIFO queue:
    // this must not depend on CATALOGUE_IATA's declared order in
    // skill-adapter.ts, nor on exactly how the JS event loop interleaves the
    // synchronous part of each `execFile` call inside `Promise.all`'s
    // fan-out — only on which destination each response belongs to. The
    // destinations below must match skill-adapter.ts's CATALOGUE_IATA as a
    // set (order irrelevant); an unlisted destination gets no queued
    // response and the test fails loudly rather than silently.
    // This test is specifically about a PARTIAL fan-out across the whole
    // catalogue, so it opts out of the live destination limit (which otherwise
    // searches only a bounded prefix — see the "live destination limit"
    // describe block below). Without this, only three destinations would be
    // searched and the partial-failure case under test would never arise.
    const PREV_LIMIT = process.env.ATLAS_LIVE_DESTINATION_LIMIT;
    process.env.ATLAS_LIVE_DESTINATION_LIMIT = "0";
    try {
    const NO_RESULTS = { status: "success", code: "SEARCH_NO_RESULTS", data: {} };
    destinationQueues = {
      DXB: [offerEnvelope("OFR-DXB")],
      NRT: [RETRYABLE, RETRYABLE, RETRYABLE],
      KIX: [NO_RESULTS],
      SIN: [NO_RESULTS],
      JFK: [NO_RESULTS],
      LIS: [NO_RESULTS],
      NAP: [NO_RESULTS],
      KEF: [NO_RESULTS],
      HAV: [NO_RESULTS],
    };
    const adapter = new SkillAtlasAdapter("sandbox");

    const offers = await adapter.searchFlights({
      origin: "LON",
      departureAfter: "2026-09-18T00:00:00.000Z",
      returnBefore: "2026-09-21T00:00:00.000Z",
      adults: 1,
    });

    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe("OFR-DXB");
    expect(execFileCalls).toHaveLength(11); // 9 destinations, NRT retried twice more
    // Every queued response was consumed — proves nothing silently fell back
    // to the shared queue or was left unread.
    expect(Object.values(destinationQueues).every((q) => q.length === 0)).toBe(true);
    } finally {
      if (PREV_LIMIT === undefined) delete process.env.ATLAS_LIVE_DESTINATION_LIMIT;
      else process.env.ATLAS_LIVE_DESTINATION_LIMIT = PREV_LIMIT;
    }
  }, 15_000);
});

describe("SkillAtlasAdapter — getBookingStatus (FIX 2: a transient status-check error is not a booking failure)", () => {
  it('a "status":"error" response that is NOT ORDER_NOT_FOUND is reported as pending/unknown, never "failed"', async () => {
    // A generic member of the CLI's catch-all "status":"error" bucket for
    // any non-retryable error, including a transient failure of the status
    // check itself. It says nothing about whether the order/ticket exists —
    // asserting "failed" here would be a real order silently reported as
    // never having happened. (SECURE_STORE_UNAVAILABLE specifically is
    // covered by its own test below, since — unlike this generic code — it
    // is now retried; see LOCALLY_RETRYABLE_CODES in skill-adapter.ts.)
    queue.push({
      status: "error",
      code: "UPSTREAM_SERVICE_ERROR",
      message: "Unexpected upstream error",
    });
    const adapter = new SkillAtlasAdapter("sandbox");

    const result = await adapter.getBookingStatus("ORDER-123");

    expect(result.state).not.toBe("failed");
    expect(result.state).toBe("pending");
    expect(execFileCalls).toHaveLength(1); // not retried — a genuinely terminal, non-special-cased code
  });

  it("SECURE_STORE_UNAVAILABLE is retried here too (same override as the search fan-out), and still reports pending — never failed — if every attempt exhausts", async () => {
    queue.push(
      { status: "error", code: "SECURE_STORE_UNAVAILABLE", message: "Secure store unavailable" },
      { status: "error", code: "SECURE_STORE_UNAVAILABLE", message: "Secure store unavailable" },
      { status: "error", code: "SECURE_STORE_UNAVAILABLE", message: "Secure store unavailable" },
    );
    const adapter = new SkillAtlasAdapter("sandbox");

    const result = await adapter.getBookingStatus("ORDER-456");

    expect(result.state).not.toBe("failed");
    expect(result.state).toBe("pending");
    expect(execFileCalls).toHaveLength(3); // bounded by RETRY_MAX_ATTEMPTS, not open-ended
  }, 10_000);

  it("ORDER_NOT_FOUND is still reported as failed — the one legitimate terminal-failure signal", async () => {
    queue.push({ status: "error", code: "ORDER_NOT_FOUND", message: "No such order" });
    const adapter = new SkillAtlasAdapter("sandbox");

    const result = await adapter.getBookingStatus("ORDER-404");

    expect(result.state).toBe("failed");
  });
});

describe("SkillAtlasAdapter — getStatus retry and provenance", () => {
  it("retries auth status and reports the real ticketing blocker", async () => {
    queue.push(RETRYABLE, {
      status: "success",
      code: "OK",
      data: { authenticated: true, ticketing_available: false, ticketing_blocker: "TICKETING_ACTIVATION_REQUIRED" },
    });
    const adapter = new SkillAtlasAdapter("sandbox");

    const status = await adapter.getStatus();

    expect(status.authorized).toBe(true);
    expect(status.ticketingAvailable).toBe(false);
    expect(status.ticketingBlockedReason).toBe("TICKETING_ACTIVATION_REQUIRED");
    // Authorized (so search genuinely is live), but ticketing_available is
    // false — provenance must say so, not claim both are live.
    expect(status.provenance).toEqual({ search: "live", ticketing: "unavailable" });
    expect(execFileCalls).toHaveLength(2);
  }, 10_000);
});

describe("mapWithConcurrency — the inline concurrency limiter (task 1)", () => {
  it("never runs more than `limit` calls concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [15, 5, 15, 5, 15, 5];

    await mapWithConcurrency(items, 2, async (ms) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight -= 1;
      return ms;
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("with limit=1 — the SEARCH_FANOUT_CONCURRENCY searchFlights actually uses — runs strictly one at a time, never overlapping", async () => {
    let inFlight = 0;
    let sawOverlap = false;
    const items = [5, 5, 5, 5];

    await mapWithConcurrency(items, 1, async (ms) => {
      inFlight += 1;
      if (inFlight > 1) sawOverlap = true;
      await new Promise((r) => setTimeout(r, ms));
      inFlight -= 1;
    });

    expect(sawOverlap).toBe(false);
  });

  it("preserves output order regardless of completion order", async () => {
    const items = [30, 10, 20];

    const results = await mapWithConcurrency(items, 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  it("processes every item exactly once, even when limit exceeds the item count", async () => {
    const items = [1, 2, 3];
    const seen: number[] = [];

    const results = await mapWithConcurrency(items, 10, async (n) => {
      seen.push(n);
      return n * 2;
    });

    expect(seen.sort()).toEqual([1, 2, 3]);
    expect(results).toEqual([2, 4, 6]);
  });
});

// ─── Live destination limit ───────────────────────────────────────────────────
//
// Serialising the fan-out fixed the keychain contention but made a full
// nine-destination live scan take ~45-51s. A live scan exists to prove the
// integration is real, not to price the whole catalogue, so it searches a
// bounded prefix by default. These tests pin that, and pin that an explicitly
// requested destination is never affected by the limit.
describe("SkillAtlasAdapter — live destination limit", () => {
  const ORIGINAL = process.env.ATLAS_LIVE_DESTINATION_LIMIT;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ATLAS_LIVE_DESTINATION_LIMIT;
    else process.env.ATLAS_LIVE_DESTINATION_LIMIT = ORIGINAL;
  });

  /** Run a catalogue-wide search (no explicit destination) and report which
   *  destinations the CLI was actually invoked for. */
  async function destinationsSearched(explicit?: string): Promise<string[]> {
    // Every destination answers successfully; we only care which were asked.
    destinationQueues = new Proxy({} as Record<string, QueuedResponse[]>, {
      get: () => [offerEnvelope("off_x")],
    });
    const adapter = new SkillAtlasAdapter("sandbox");
    const input = { ...searchInput("BCN") } as Record<string, unknown>;
    if (explicit) input.destination = explicit;
    else delete input.destination;
    await adapter.searchFlights(input as never);
    return execFileCalls
      .map((a) => destinationArg(a))
      .filter((d): d is string => Boolean(d));
  }

  it("searches a bounded prefix of the catalogue by default, not all nine", async () => {
    delete process.env.ATLAS_LIVE_DESTINATION_LIMIT;
    const searched = await destinationsSearched();
    expect(new Set(searched).size).toBe(3);
  });

  it("searches the whole catalogue when the limit is 0", async () => {
    process.env.ATLAS_LIVE_DESTINATION_LIMIT = "0";
    const searched = await destinationsSearched();
    expect(new Set(searched).size).toBe(9);
  });

  it("clamps a limit larger than the catalogue", async () => {
    process.env.ATLAS_LIVE_DESTINATION_LIMIT = "50";
    const searched = await destinationsSearched();
    expect(new Set(searched).size).toBe(9);
  });

  it("ignores the limit when the caller names a destination", async () => {
    delete process.env.ATLAS_LIVE_DESTINATION_LIMIT;
    const searched = await destinationsSearched("BCN");
    expect([...new Set(searched)]).toEqual(["BCN"]);
  });
});
