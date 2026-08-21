import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nanoid } from "nanoid";
import type { AgentActivity, BookingResult, BookingState, DemoScenario, VerifiedOffer } from "./types";
import { buildDemoWorld, type DemoWorld } from "./demo/world";
import type { TravellerProfile } from "./profile";
import type { EngineResult } from "./engine";

/**
 * Server-side session state for one demo run.
 *
 * The fast path is still a plain in-memory `Map` — every read (`getSession`)
 * and every mutation a request handler makes goes straight through it, same
 * as before. What changed (task 5): every write that matters is *also*
 * mirrored to a small JSON snapshot on disk, and that snapshot is reloaded
 * on module init. That is the smallest fix for the actual failure mode this
 * addresses — a server restart mid-demo (a crash, a redeploy, `npm run dev`
 * picking up a file change) used to wipe every in-flight session, so the
 * next request from the client 404'd and silently restarted the run. A judge
 * mid-checkpoint should not lose their booking state to a process bounce.
 *
 * Deliberately NOT a database: that is a bigger dependency and a bigger
 * failure surface than a hackathon demo's session count justifies. A single
 * JSON file, written with a temp-file-then-rename so a crash mid-write can
 * never leave a half-written file for the next boot to choke on, is the
 * whole mechanism. Swap this for SQLite/Postgres the day session volume or
 * concurrent-writer count actually needs it.
 */

/**
 * Where the snapshot lives. Overridable (tests use this to point at an
 * isolated temp file; a real deployment could point it at a mounted volume)
 * but defaults to a repo-local, gitignored directory — see .gitignore's
 * `/.data/` entry. Never commit this path's contents: even redacted (see
 * `redactForDisk` below), it is live session state, not source.
 */
const DATA_FILE =
  process.env.CALENDAIR_SESSION_STORE_PATH || join(process.cwd(), ".data", "calendair-sessions.json");

const TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Strip the one field in a Session that can hold a real secret: a
 * traveller's actual government document number (PassengerProfile.
 * documentNumber). Everything else in Session is either synthetic demo
 * world data, or — for a profile built from onboarding — informational
 * fields no more sensitive than what already appears in this app's own API
 * responses (see session/route.ts, which masks this exact field the same
 * way for the client). No auth tokens, API keys or credentials ever reach
 * a Session in the first place — the atlas-flight CLI keeps its own token
 * in the OS keyring (see skill-adapter.ts), never in application state — so
 * this one mask is the whole job.
 */
function redactForDisk(session: Session): Session {
  const clone: Session = JSON.parse(JSON.stringify(session));
  const num = clone.world?.passenger?.documentNumber;
  if (typeof num === "string" && num.length > 0) {
    clone.world.passenger.documentNumber = num.length > 2 ? `••••••${num.slice(-2)}` : "••••••";
  }
  return clone;
}

function loadFromDisk(): Map<string, Session> {
  try {
    // turbopackIgnore: DATA_FILE resolves at runtime (env override or a
    // fixed .data/ path under cwd); it never points inside the app's own
    // source tree, so it must not make the bundler trace and ship the whole
    // project as a false-positive "this file might be read at runtime".
    if (!existsSync(/* turbopackIgnore: true */ DATA_FILE)) return new Map();
    const raw = readFileSync(/* turbopackIgnore: true */ DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Session[];
    const cutoff = Date.now() - TTL_MS;
    // Do not resurrect anything already past its TTL — a snapshot written
    // hours ago should not un-expire a session sweep() would otherwise have
    // dropped.
    return new Map(parsed.filter((s) => s.touchedAt >= cutoff).map((s) => [s.id, s]));
  } catch {
    // A missing, corrupt or unreadable snapshot must never crash startup —
    // start empty, exactly like a first boot. This is a durability upgrade
    // over pure in-memory, not a new hard dependency the app can fail on.
    return new Map();
  }
}

function persistToDisk(current: Map<string, Session>) {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const redacted = Array.from(current.values()).map(redactForDisk);
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(redacted), "utf-8");
    renameSync(tmp, DATA_FILE); // atomic on the same filesystem — no half-written snapshot ever lands at DATA_FILE
  } catch {
    // Same principle as loadFromDisk: a disk write failure degrades this
    // back to plain in-memory behaviour for that one write. It must never
    // throw into a request handler or break the in-memory fast path a demo
    // is actually running on.
  }
}

export interface CalendarBlock {
  id: string;
  kind: "outbound" | "destination" | "return" | "buffer";
  title: string;
  startIso: string;
  endIso: string;
  /** Airports whose local time each end of the block should be read in. */
  startAt: string;
  endAt: string;
  /** Tentative until fulfilment is actually confirmed. */
  tentative: boolean;
}

export interface BookingRun {
  state: BookingState;
  tripId?: string;
  approvedTotal?: number;
  approvedCurrency?: string;
  verified?: VerifiedOffer;
  /** Set when reverification moved the price. */
  previousTotal?: number;
  replans: number;
  reference?: string;
  result?: BookingResult;
  calendarBlocks?: CalendarBlock[];
}

export interface Session {
  id: string;
  createdAt: number;
  touchedAt: number;
  scenario: DemoScenario;
  world: DemoWorld;
  engine?: EngineResult;
  booking: BookingRun;
  activity: AgentActivity[];
}

// Hydrated once, at module init, from whatever the last process (or this
// one, on a hot reload) left on disk — this is the "loaded on boot" half of
// task 5. Everything after this line reads/writes `sessions` exactly as
// before; disk durability is layered on top via `saveSession`, not woven
// into every mutation site.
const sessions: Map<string, Session> = loadFromDisk();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  let changed = false;
  for (const [id, s] of sessions) {
    if (s.touchedAt < cutoff) {
      sessions.delete(id);
      changed = true;
    }
  }
  if (changed) persistToDisk(sessions);
}

/**
 * Start a run.
 *
 * A profile is optional. Without one the prepared demo traveller is used, which
 * is what keeps a judged run and the end-to-end script independent of anybody
 * having completed onboarding. The caller is responsible for having sanitised
 * anything that arrived from a browser.
 */
export function createSession(
  scenario: DemoScenario,
  now = new Date(),
  profile?: TravellerProfile,
): Session {
  sweep();
  const session: Session = {
    id: nanoid(10),
    createdAt: Date.now(),
    touchedAt: Date.now(),
    scenario,
    world: buildDemoWorld(now, scenario, profile ? { profile } : {}),
    booking: { state: "WINDOW_DETECTED", replans: 0 },
    activity: [],
  };
  sessions.set(session.id, session);
  persistToDisk(sessions); // a session must survive a restart from the moment it exists, not from its first later mutation
  return session;
}

export function getSession(id: string): Session | undefined {
  const s = sessions.get(id);
  if (s) s.touchedAt = Date.now();
  return s;
}

/**
 * Mirror the current in-memory state of `session` to disk.
 *
 * Called explicitly by route handlers after `flow.ts` mutates a session —
 * `scan`, `authorize`, `acceptPrice`, `book` and `pollFulfilment` all reach
 * into `session.booking`/`session.engine` directly rather than through a
 * setter, so there is no single mutation choke point inside this module to
 * hook automatically. One call at the end of each mutating request handler
 * is the smallest reliable substitute: it captures the state that handler's
 * response is already describing to the client, so the two can never drift
 * apart. Read-only routes (`/state`) do not call this — nothing changed for
 * them to persist.
 */
export function saveSession(session: Session): void {
  session.touchedAt = Date.now();
  persistToDisk(sessions);
}

export function pushActivity(session: Session, ...events: AgentActivity[]) {
  session.activity.push(...events);
  // The log is evidence, not storage: keep it bounded.
  if (session.activity.length > 200) session.activity.splice(0, session.activity.length - 200);
}

export function activityEvent(
  source: AgentActivity["source"],
  title: string,
  detail: string,
  ok = true,
  durationMs?: number,
): AgentActivity {
  return {
    id: nanoid(8),
    atIso: new Date().toISOString(),
    source,
    title,
    detail,
    ok,
    durationMs,
  };
}
