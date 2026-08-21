#!/usr/bin/env node
/**
 * End-to-end check of the whole agent loop, over the real HTTP API.
 *
 * It drives the same routes the interface does — window → search → filter →
 * recommendation → authorise → reverify → checkpoint → book → assert outcome →
 * calendar — and asserts the safety properties rather than the pixels.
 *
 * Set BASE_URL to test a running server; otherwise a dev server is started here
 * and shut down at the end.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.E2E_PORT ?? "3123";
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const OWNED = !process.env.BASE_URL;

let server;
let failures = 0;

function check(name, ok, detail = "") {
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
const get = (path) => fetch(`${BASE}${path}`).then((r) => r.json());

async function waitForHealth(timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const h = await get("/api/health");
      if (h.ok) return h;
    } catch {
      // Still compiling.
    }
    await sleep(700);
  }
  throw new Error("Server did not become healthy in time.");
}

async function newRun(scenario) {
  const session = await post("/api/calendair/session", { scenario });
  const scan = await post(`/api/calendair/session/${session.sessionId}/scan`);
  return { id: session.sessionId, session, scan };
}

async function scenarioPerfect() {
  console.log("\nperfect — the clean path");
  const { id, session, scan } = await newRun("perfect");

  check("a window is detected", session.world.window.hours === 68, `${session.world.window.hours}h`);
  check("the companion is matched on availability alone", session.world.window.sharedWith.length === 1);
  check(
    "no companion event titles are exposed",
    !JSON.stringify(session.world.companions).match(/title/i),
  );
  check("one hero recommendation", Boolean(scan.recommended));
  check("at most two alternates", scan.alternates.length <= 2, `${scan.alternates.length}`);
  check(
    "candidates were rejected with named rules",
    scan.rejected.length > 0 && scan.rejected.every((r) => r.rule),
    scan.rejected.map((r) => r.rule).join(", "),
  );
  check(
    "no reference-only fare survived",
    [scan.recommended, ...scan.alternates].every((t) => t && !t.referenceOnly),
  );
  check(
    "the hero is inside the hard budget",
    scan.recommended.totalPrice <= session.world.taste.maxSpontaneousSpend,
  );
  check(
    "the score is the sum of its factors",
    Math.round(scan.recommended.factors.reduce((n, f) => n + f.points, 0)) ===
      scan.recommended.escapeScore,
  );

  const auth = await post(`/api/calendair/session/${id}/authorize`, {
    tripId: scan.recommended.id,
  });
  check("authorising reverifies rather than booking", auth.outcome.kind === "confirmed");
  check("nothing was written yet", auth.state === "PRICE_CONFIRMED");

  const booked = await post(`/api/calendair/session/${id}/book`);
  check("booking starts pending, never confirmed", booked.result.state === "pending");
  check("the reference is labelled as a test", booked.result.testMode === true);

  let state = booked.state;
  for (let i = 0; i < 12 && state !== "COMPLETE"; i++) {
    await sleep(600);
    ({ state } = await get(`/api/calendair/session/${id}/fulfilment`));
  }
  check("fulfilment is asserted, then complete", state === "COMPLETE", state);

  const final = await get(`/api/calendair/session/${id}/state`);
  check("the calendar is written after confirmation", final.booking.calendarBlocks?.length === 4);
  check(
    "no calendar block is left tentative",
    final.booking.calendarBlocks?.every((b) => !b.tentative),
  );
  check(
    "the activity log carries no secrets",
    !JSON.stringify(final.activity).match(/TR0000001|passport|token/i),
  );
}

async function scenarioPriceChange() {
  console.log("\nprice-change — a difference is never absorbed");
  const { id, scan } = await newRun("price-change");
  const shown = scan.recommended.totalPrice;

  const auth = await post(`/api/calendair/session/${id}/authorize`, { tripId: scan.recommended.id });
  check("the flow stops on a price change", auth.outcome.kind === "price-changed");
  check("both totals are reported", auth.outcome.previous === shown && auth.outcome.current > shown);

  const early = await post(`/api/calendair/session/${id}/book`);
  check("booking is refused before acceptance", Boolean(early.error));

  const accepted = await post(`/api/calendair/session/${id}/accept-price`);
  check("acceptance is a separate act", accepted.outcome.kind === "confirmed");
  check(
    "the approved total is the new one",
    accepted.booking.approvedTotal === auth.outcome.current,
  );

  const booked = await post(`/api/calendair/session/${id}/book`);
  check("booking proceeds once accepted", booked.result?.state === "pending");
}

async function scenarioSoldOut() {
  console.log("\nsold-out — bounded replanning, then a decision");
  const { id, scan } = await newRun("sold-out");

  const auth = await post(`/api/calendair/session/${id}/authorize`, { tripId: scan.recommended.id });
  check("the fare is found gone at reverification", auth.outcome.kind === "unavailable");
  check("a replacement clears the same rules", Boolean(auth.outcome.replacement));
  check("the replan is counted", auth.booking.replans === 1);
  check("nothing was substituted silently", auth.booking.verified == null);

  const take = await post(`/api/calendair/session/${id}/authorize`, {
    tripId: auth.outcome.replacement.id,
  });
  check("the traveller can take the replacement", take.outcome.kind === "confirmed");
}

async function scenarioPending() {
  console.log("\npending — an unconfirmed booking is never called confirmed");
  const { id, scan } = await newRun("pending");
  await post(`/api/calendair/session/${id}/authorize`, { tripId: scan.recommended.id });
  await post(`/api/calendair/session/${id}/book`);

  await sleep(3200);
  const polled = await get(`/api/calendair/session/${id}/fulfilment`);
  check("state stays pending", polled.state === "BOOKING_PENDING", polled.state);
  check("the label is honest", /await/i.test(polled.result.rawStatusLabel ?? ""));

  const final = await get(`/api/calendair/session/${id}/state`);
  check("no calendar was written", !final.booking.calendarBlocks);
}

try {
  if (OWNED) {
    console.log(`Starting a dev server on ${PORT}…`);
    server = spawn("npx", ["next", "dev", "-p", PORT], {
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, DEMO_MODE: "hybrid" },
    });
  }
  const health = await waitForHealth();
  console.log(`Health: ${health.service} · atlas adapter "${health.atlas.adapter}"`);

  await scenarioPerfect();
  await scenarioPriceChange();
  await scenarioSoldOut();
  await scenarioPending();
} catch (err) {
  failures += 1;
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
} finally {
  server?.kill("SIGTERM");
}

console.log(failures === 0 ? "\nAll end-to-end checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
