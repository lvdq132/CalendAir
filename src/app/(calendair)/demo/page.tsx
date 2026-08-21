"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/calendair/SessionProvider";
import { Screen } from "@/components/calendair/Screen";
import { Card, Pill } from "@/components/calendair/ui";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { Check, Refresh, Star } from "@/components/calendair/icons";
import { clearProfile } from "@/lib/onboarding/profile-store";
import type { DemoScenario } from "@/lib/calendair/types";

const SCENARIOS: { id: DemoScenario; title: string; body: string }[] = [
  {
    id: "perfect",
    title: "Perfect",
    body: "The fare holds at reverification and ticketing completes. The clean end-to-end path.",
  },
  {
    id: "price-change",
    title: "Price change",
    body: "The live recheck comes back higher. The flow stops and waits for an explicit acceptance.",
  },
  {
    id: "sold-out",
    title: "Sold out",
    body: "The leading fare is withdrawn. Bounded replanning takes over, then a safe stop.",
  },
  {
    id: "pending",
    title: "Ticketing pending",
    body: "The booking is accepted but never confirms. The app holds at awaiting confirmation rather than claiming success.",
  },
];

/** The presenter's console. Nothing here changes what the app is willing to claim. */
export default function DemoScreen() {
  const router = useRouter();
  const { scenario, atlas, demoMode, start, sessionId, world } = useSession();
  const { replayEverything, restartTour, openGuide } = useOnboarding();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [switching, setSwitching] = useState<DemoScenario | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  async function pick(next: DemoScenario) {
    setSwitching(next);
    await start(next);
    setSwitching(null);
    router.push("/");
  }

  /** Put the run back on the prepared traveller, so the scripted numbers return. */
  async function usePrepared() {
    clearProfile();
    await start(scenario);
    router.push("/");
  }

  return (
    <Screen back="/">
      <div className="ca-stack">
        <div>
          <h1 className="ca-display" style={{ fontSize: "var(--ca-t-xl)", margin: 0 }}>
            Demo console
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--ca-stone-500)", fontSize: "var(--ca-t-sm)" }}>
            Choosing a scenario restarts the run. The provider mode is whatever the environment
            actually configures — this screen cannot fake it.
          </p>
        </div>

        <Card pad>
          <span className="ca-eyebrow">Provider</span>
          <div style={{ display: "grid", gap: "var(--ca-2)", marginTop: "var(--ca-3)" }}>
            <KV k="Adapter" v={atlas?.adapter ?? "…"} />
            <KV k="Label" v={atlas?.label ?? "…"} />
            <KV k="Environment" v={atlas?.environment ?? "…"} />
            <KV k="Authorised" v={String(atlas?.authorized ?? false)} />
            <KV k="Ticketing available" v={String(atlas?.ticketingAvailable ?? false)} />
            <KV k="Search provenance" v={atlas?.provenance?.search ?? "…"} />
            <KV k="Ticketing provenance" v={atlas?.provenance?.ticketing ?? "…"} />
            {atlas?.ticketingBlockedReason && (
              <KV k="Ticketing blocked reason" v={atlas.ticketingBlockedReason} />
            )}
            <KV k="Integration mode" v={String((health?.atlas as Record<string, unknown>)?.integrationMode ?? "…")} />
            <KV k="Demo mode (display only)" v={demoMode} />
            <KV k="Max replans" v={String(health?.maxReplans ?? "…")} />
            <KV k="Session" v={sessionId ?? "…"} />
          </div>
          <p className="ca-label" style={{ marginTop: "var(--ca-4)" }}>
            <code>ATLAS_INTEGRATION_MODE</code> is the only switch that changes what Atlas actually
            does — <code>DEMO_MODE</code> above is a label this console prints, not a behaviour
            switch. {atlas?.adapter === "demo" &&
              "Deterministic inventory here; the app refuses to substitute this data for a live call rather than falling back quietly."}
          </p>
        </Card>

        <Card pad>
          <span className="ca-eyebrow">Scenario</span>
          <div style={{ marginTop: "var(--ca-3)" }}>
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s.id)}
                disabled={switching !== null}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: "var(--ca-3)",
                  alignItems: "center",
                  width: "100%",
                  textAlign: "left",
                  padding: "var(--ca-4) 0",
                  border: "none",
                  borderTop: "1px solid var(--ca-line-soft)",
                  background: "none",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="ca-serif" style={{ display: "block", fontSize: "var(--ca-t-md)" }}>
                    {s.title}
                  </span>
                  <span className="ca-label" style={{ whiteSpace: "normal" }}>
                    {s.body}
                  </span>
                </span>
                {scenario === s.id ? (
                  <Pill tone="sage">
                    <Check size={13} /> Active
                  </Pill>
                ) : switching === s.id ? (
                  <Star size={15} className="ca-pulse" style={{ color: "var(--ca-gold-500)" }} />
                ) : (
                  <span className="ca-link">Run</span>
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card pad>
          <span className="ca-eyebrow">Traveller</span>
          <p style={{ margin: "var(--ca-2) 0 0", fontSize: "var(--ca-t-sm)" }}>
            {world?.profileSource === "traveller"
              ? "This browser has its own profile, so the scripted numbers may differ."
              : "Running on the prepared demo traveller — the scripted numbers hold."}
          </p>
          <div style={{ display: "grid", gap: "var(--ca-3)", marginTop: "var(--ca-4)" }}>
            <Link href="/onboarding" className="ca-btn ca-btn--quiet">
              Open onboarding
            </Link>
            {world?.profileSource === "traveller" && (
              <button type="button" className="ca-btn ca-btn--quiet" onClick={usePrepared}>
                <Refresh size={15} /> Use the prepared traveller
              </button>
            )}
          </div>
        </Card>

        <Card pad>
          <span className="ca-eyebrow">Onboarding</span>
          <div style={{ display: "grid", gap: "var(--ca-3)", marginTop: "var(--ca-4)" }}>
            <button type="button" className="ca-btn ca-btn--quiet" onClick={replayEverything}>
              Replay the introduction
            </button>
            <button type="button" className="ca-btn ca-btn--quiet" onClick={restartTour}>
              Restart the guided tour
            </button>
            <button type="button" className="ca-btn ca-btn--quiet" onClick={() => openGuide("atlas")}>
              Open the flight-layer guide
            </button>
          </div>
        </Card>

        <button type="button" className="ca-btn ca-btn--navy" onClick={() => pick(scenario)}>
          <Refresh size={16} /> Reset this run
        </button>
      </div>
    </Screen>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--ca-4)" }}>
      <span className="ca-label">{k}</span>
      <span
        className="ca-num"
        style={{
          fontSize: "var(--ca-t-xs)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {v}
      </span>
    </div>
  );
}
