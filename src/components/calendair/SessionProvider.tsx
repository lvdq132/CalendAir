"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AgentActivity,
  AtlasAccountStatus,
  BookingState,
  BusyBlock,
  DemoScenario,
  DetectedWindow,
  RejectedCandidate,
  ScoredTrip,
  TravelTaste,
} from "@/lib/calendair/types";
import type { BookingRun } from "@/lib/calendair/store";
import { readProfile } from "@/lib/onboarding/profile-store";

/**
 * One demo run, held on the client.
 *
 * Every consequential step is a call to the server, which owns the state
 * machine — the client never decides that a booking is confirmed. The session id
 * is kept in sessionStorage so a reload lands back where it was rather than
 * restarting the story mid-demo.
 */

const KEY = "calendair.session";

export interface WorldSnapshot {
  taste: TravelTaste;
  window: DetectedWindow;
  companions: { id: string; name: string; relationship: string }[];
  busy: BusyBlock[];
  nextCommitmentIso: string;
  /** Whether the live rules came from the traveller or the prepared demo profile. */
  profileSource?: "demo" | "traveller";
}

export interface EngineSnapshot {
  recommended: ScoredTrip | null;
  alternates: ScoredTrip[];
  rejected: RejectedCandidate[];
  scanned: number;
  constraintsActive: number;
}

export type Outcome =
  | { kind: "confirmed"; total: number; currency: string }
  | { kind: "price-changed"; previous: number; current: number; currency: string }
  | { kind: "unavailable"; replacement?: ScoredTrip }
  | { kind: "safe-stop"; reason: string };

interface Ctx {
  ready: boolean;
  sessionId: string | null;
  scenario: DemoScenario;
  demoMode: string;
  atlas: AtlasAccountStatus | null;
  world: WorldSnapshot | null;
  engine: EngineSnapshot | null;
  booking: BookingRun;
  activity: AgentActivity[];
  scanning: boolean;
  busy: boolean;
  error: string | null;
  /** What the last checkpoint came back with, so a screen can act on it. */
  outcome: Outcome | null;
  start: (scenario?: DemoScenario) => Promise<void>;
  scan: () => Promise<EngineSnapshot | null>;
  authorize: (tripId: string) => Promise<Outcome | null>;
  acceptPrice: () => Promise<Outcome | null>;
  book: () => Promise<boolean>;
  pollFulfilment: () => Promise<BookingState | null>;
  /** Lazily fetch a Qwen "why this works" sentence. Null when not configured. */
  explain: (tripId: string) => Promise<string | null>;
  tripById: (id: string) => ScoredTrip | undefined;
}

const SessionCtx = createContext<Ctx | null>(null);

export function useSession(): Ctx {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

const EMPTY_BOOKING: BookingRun = { state: "WINDOW_DETECTED", replans: 0 };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<DemoScenario>("perfect");
  const [demoMode, setDemoMode] = useState("hybrid");
  const [atlas, setAtlas] = useState<AtlasAccountStatus | null>(null);
  const [world, setWorld] = useState<WorldSnapshot | null>(null);
  const [engine, setEngine] = useState<EngineSnapshot | null>(null);
  const [booking, setBooking] = useState<BookingRun>(EMPTY_BOOKING);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busyFlag, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const starting = useRef(false);

  const start = useCallback(async (next?: DemoScenario) => {
    setError(null);
    // The traveller's own profile, read at the moment the run begins, so the very
    // first search already uses their rules instead of the demo traveller's.
    const profile = readProfile();
    const res = await fetch("/api/calendair/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: next, profile: profile ?? undefined }),
    });
    if (!res.ok) {
      setError("Could not start a session.");
      return;
    }
    const data = await res.json();
    setSessionId(data.sessionId);
    setScenario(data.scenario);
    setDemoMode(data.demoMode);
    setAtlas(data.atlas);
    setWorld(data.world);
    setBooking(data.booking);
    setEngine(null);
    setActivity([]);
    setOutcome(null);
    try {
      window.sessionStorage.setItem(KEY, data.sessionId);
    } catch {
      // A session that cannot be remembered still works for one page view.
    }
  }, []);

  // Resume where the traveller left off, or begin a new run.
  useEffect(() => {
    if (starting.current) return;
    starting.current = true;
    (async () => {
      let existing: string | null = null;
      try {
        existing = window.sessionStorage.getItem(KEY);
      } catch {
        existing = null;
      }
      try {
        if (existing) {
          const res = await fetch(`/api/calendair/session/${existing}/state`);
          if (res.ok) {
            const data = await res.json();
            setSessionId(existing);
            setWorld(data.world);
            setBooking(data.booking);
            setActivity(data.activity ?? []);
            setEngine(data.engine ?? null);
            const health = await fetch("/api/health").then((r) => r.json()).catch(() => null);
            if (health?.atlas) setAtlas(health.atlas);
            if (health?.demoScenario) setScenario(health.demoScenario);
            setReady(true);
            return;
          }
        }
        await start();
      } catch {
        // A network-level failure here (fetch() itself rejecting) must not
        // become an unhandled promise rejection and must not leave the app
        // stuck on "Reading your calendar…" forever.
        setError("Could not reach the server. Check your connection and try again.");
      } finally {
        setReady(true);
      }
    })();
  }, [start]);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!sessionId) return null;
      setError(null);
      // A network-level failure (fetch() itself rejecting — offline, DNS,
      // the dev server restarting mid-demo) must become an honest, caught
      // error here, not an unhandled promise rejection that escapes every
      // caller of scan()/authorize()/book()/pollFulfilment() etc. (several
      // of which are invoked as `void scan()` or from an interval callback,
      // with no catch of their own).
      let res: Response;
      try {
        res = await fetch(`/api/calendair/session/${sessionId}${path}`, init);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
        return null;
      }
      const data = await res.json().catch(() => null);
      // Even an error response can carry the session's real state (e.g. a
      // failed /book call still reports BOOKING_FAILED / BOOKING_OUTCOME_UNKNOWN)
      // — applying it here is what lets the UI show the true checkpoint
      // instead of silently freezing on whatever screen was showing before
      // the request went out.
      if (data?.activity) setActivity(data.activity);
      if (data?.booking) setBooking(data.booking);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return null;
      }
      return data;
    },
    [sessionId],
  );

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const data = await call("/scan", { method: "POST" });
      if (!data) return null;
      const snapshot: EngineSnapshot = {
        recommended: data.recommended,
        alternates: data.alternates ?? [],
        rejected: data.rejected ?? [],
        scanned: data.scanned ?? 0,
        constraintsActive: data.constraintsActive ?? 0,
      };
      setEngine(snapshot);
      setBooking((b) => ({ ...b, state: data.state }));
      return snapshot;
    } finally {
      setScanning(false);
    }
  }, [call]);

  const authorize = useCallback(
    async (tripId: string) => {
      setBusy(true);
      try {
        const data = await call("/authorize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tripId }),
        });
        const next = (data?.outcome as Outcome) ?? null;
        setOutcome(next);
        return next;
      } finally {
        setBusy(false);
      }
    },
    [call],
  );

  const acceptPrice = useCallback(async () => {
    setBusy(true);
    try {
      const data = await call("/accept-price", { method: "POST" });
      const next = (data?.outcome as Outcome) ?? null;
      setOutcome(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [call]);

  const book = useCallback(async () => {
    setBusy(true);
    try {
      const data = await call("/book", { method: "POST" });
      return Boolean(data);
    } finally {
      setBusy(false);
    }
  }, [call]);

  const pollFulfilment = useCallback(async () => {
    const data = await call("/fulfilment");
    return (data?.state as BookingState) ?? null;
  }, [call]);

  const explain = useCallback(
    async (tripId: string) => {
      if (!sessionId) return null;
      const res = await fetch(`/api/calendair/session/${sessionId}/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return (data?.explanation as string | null) ?? null;
    },
    [sessionId],
  );

  const tripById = useCallback(
    (id: string) =>
      [engine?.recommended, ...(engine?.alternates ?? [])].find(
        (t): t is ScoredTrip => t?.id === id,
      ),
    [engine],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      sessionId,
      scenario,
      demoMode,
      atlas,
      world,
      engine,
      booking,
      activity,
      scanning,
      busy: busyFlag,
      error,
      outcome,
      start,
      scan,
      authorize,
      acceptPrice,
      book,
      pollFulfilment,
      explain,
      tripById,
    }),
    [
      ready,
      sessionId,
      scenario,
      demoMode,
      atlas,
      world,
      engine,
      booking,
      activity,
      scanning,
      busyFlag,
      error,
      outcome,
      start,
      scan,
      authorize,
      acceptPrice,
      book,
      pollFulfilment,
      explain,
      tripById,
    ],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
