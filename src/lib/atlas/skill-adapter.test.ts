import { beforeEach, describe, expect, it, vi } from "vitest";

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
const execFileCalls: string[][] = [];

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    args: string[],
    _options: unknown,
    callback: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void,
  ) => {
    execFileCalls.push(args);
    const next = queue.shift();
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

const { SkillAtlasAdapter } = await import("./skill-adapter");
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

function offerEnvelope(id: string): QueuedResponse {
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
          price_status: "bookable",
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
  execFileCalls.length = 0;
});

describe("SkillAtlasAdapter — retry with backoff (task 1)", () => {
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
    queue.push(
      offerEnvelope("OFR-DXB"), // DXB
      RETRYABLE, // NRT attempt 1
      { status: "success", code: "SEARCH_NO_RESULTS", data: {} }, // KIX
      { status: "success", code: "SEARCH_NO_RESULTS", data: {} }, // SIN
      { status: "success", code: "SEARCH_NO_RESULTS", data: {} }, // JFK
      { status: "success", code: "SEARCH_NO_RESULTS", data: {} }, // LIS
      { status: "success", code: "SEARCH_NO_RESULTS", data: {} }, // NAP
      { status: "success", code: "SEARCH_NO_RESULTS", data: {} }, // KEF
      { status: "success", code: "SEARCH_NO_RESULTS", data: {} }, // HAV
      RETRYABLE, // NRT attempt 2
      RETRYABLE, // NRT attempt 3
    );
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
  }, 15_000);
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
    expect(status.provenance).toEqual({ search: "live", ticketing: "live" });
    expect(execFileCalls).toHaveLength(2);
  }, 10_000);
});
