import { nanoid } from "nanoid";
import type { AgentActivity, BookingResult, BookingState, DemoScenario, VerifiedOffer } from "./types";
import { buildDemoWorld, type DemoWorld } from "./demo/world";
import type { TravellerProfile } from "./profile";
import type { EngineResult } from "./engine";

/**
 * Server-side session state for one demo run.
 *
 * In memory on purpose: a hackathon demo should not depend on a database being
 * reachable from the stage, and nothing here is worth persisting. Swap this for
 * SQLite the day sessions need to outlive the process.
 */

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

const TTL_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, Session>();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, s] of sessions) if (s.touchedAt < cutoff) sessions.delete(id);
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
  return session;
}

export function getSession(id: string): Session | undefined {
  const s = sessions.get(id);
  if (s) s.touchedAt = Date.now();
  return s;
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
