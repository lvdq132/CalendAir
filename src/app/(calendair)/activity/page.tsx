"use client";

import Link from "next/link";
import { useSession } from "@/components/calendair/SessionProvider";
import { Screen } from "@/components/calendair/Screen";
import { Card, Pill, ScoreRing, Stat, Stats } from "@/components/calendair/ui";
import { Check, ChevronRight, Clock, Shield, Star } from "@/components/calendair/icons";
import { money } from "@/components/calendair/format";
import { OPPORTUNITY_LABEL } from "@/lib/calendair/scoring";
import { DESTINATION_BY_IATA } from "@/lib/calendair/destinations";
import { formatInZone } from "@/lib/calendair/time";
import type { ActivitySource } from "@/lib/calendair/types";

const SOURCE_COLOUR: Record<ActivitySource, string> = {
  CALENDAR: "var(--ca-sage-500)",
  ATLAS: "var(--ca-gold-400)",
  CALENDAIR: "var(--ca-gold-300)",
  QWEN: "var(--ca-stone-400)",
};

/**
 * Behind the curtain.
 *
 * The only dark screen in the product, because it is the only one that is not
 * for deciding — it is for checking. The rejected list matters as much as the
 * timeline: a filter nobody watches work is a filter nobody believes.
 */
export default function ActivityScreen() {
  const { ready, world, engine, activity, scanning } = useSession();

  return (
    <Screen back="/" night>
      <div className="ca-stack">
        <Card pad data-tour="activity.stats">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 52,
                  height: 52,
                  borderRadius: "var(--ca-r-full)",
                  border: "1px solid var(--ca-night-line)",
                  color: "var(--ca-gold-400)",
                }}
              >
                <Star size={22} className={scanning ? "ca-pulse" : undefined} />
              </span>
              <div>
                <div
                  className="ca-serif"
                  style={{ fontSize: "var(--ca-t-lg)", color: "var(--ca-night-text)" }}
                >
                  Agent activity
                </div>
                <span style={{ fontSize: "var(--ca-t-xs)", color: "var(--ca-night-muted)" }}>
                  {scanning ? "Working now" : "Everything it did, timed and attributed"}
                </span>
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: "var(--ca-t-xs)",
                color: "var(--ca-gold-400)",
              }}
            >
              <span className="ca-dot ca-pulse" style={{ background: "var(--ca-gold-400)" }} />
              {scanning ? "Live" : "Idle"}
            </span>
          </div>

          <div style={{ marginTop: "var(--ca-5)" }}>
            <Stats cols={3}>
              <Stat
                label="Window"
                value={<span style={{ fontSize: "var(--ca-t-md)" }}>{world?.window.hours ?? 0} hours</span>}
              />
              <Stat
                label="Scanned"
                value={<span style={{ fontSize: "var(--ca-t-md)" }}>{engine?.scanned ?? 0}</span>}
                hint="itineraries"
              />
              <Stat
                label="Hard rules"
                value={<span style={{ fontSize: "var(--ca-t-md)" }}>{engine?.constraintsActive ?? 0}</span>}
                hint="active"
              />
            </Stats>
          </div>
        </Card>

        {/* Timeline */}
        <Card pad data-tour="activity.log">
          <span className="ca-eyebrow" style={{ color: "var(--ca-gold-400)" }}>
            Timeline
          </span>
          <div className="ca-steps" style={{ marginTop: "var(--ca-2)" }}>
            {activity.length === 0 && (
              <p style={{ color: "var(--ca-night-muted)", fontSize: "var(--ca-t-sm)" }}>
                Nothing yet. The agent logs each step as it takes it.
              </p>
            )}
            {activity.map((a, i) => (
              <div
                key={a.id}
                className={`ca-step${i === activity.length - 1 && scanning ? " is-active" : " is-done"}`}
              >
                <span className="ca-step__node">
                  {a.ok ? <Check size={12} /> : <Shield size={12} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="ca-step__title">{a.title}</span>
                  <span className="ca-step__detail" style={{ display: "block" }}>
                    {a.detail}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      marginTop: 4,
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: SOURCE_COLOUR[a.source],
                    }}
                  >
                    <span className="ca-dot" style={{ background: "currentColor", width: 5, height: 5 }} />
                    {a.source}
                  </span>
                </span>
                <span className="ca-step__meta">
                  {formatInZone(a.atIso, world ? "Asia/Shanghai" : "UTC", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                  {a.durationMs != null && (
                    <span style={{ display: "block" }}>{a.durationMs}ms</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: "var(--ca-4)", fontSize: "var(--ca-t-xs)", color: "var(--ca-night-muted)" }}>
            Sanitised by design. No event titles, access tokens, document numbers or payment details
            ever reach this log.
          </p>
        </Card>

        {/* Ranked */}
        {engine?.recommended && (
          <Card pad>
            <span className="ca-eyebrow" style={{ color: "var(--ca-gold-400)" }}>
              Ranked
            </span>
            {[engine.recommended, ...engine.alternates].map((t, i) => (
              <Link
                key={t.id}
                href={`/opportunity/${t.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px minmax(0,1fr) auto auto",
                  alignItems: "center",
                  gap: "var(--ca-3)",
                  padding: "var(--ca-4) 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--ca-night-line)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: "var(--ca-r-full)",
                    border: "1px solid var(--ca-night-line)",
                    fontFamily: "var(--ca-display)",
                    color: "var(--ca-gold-400)",
                  }}
                >
                  #{i + 1}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    className="ca-serif"
                    style={{ display: "block", fontSize: "var(--ca-t-md)", color: "var(--ca-night-text)" }}
                  >
                    {t.destinationName}
                  </span>
                  <span style={{ fontSize: "var(--ca-t-xs)", color: "var(--ca-night-muted)" }}>
                    {OPPORTUNITY_LABEL[t.opportunityType]} · {money(t.totalPrice, t.currency)} ·{" "}
                    {DESTINATION_BY_IATA[t.destination]?.climate}
                  </span>
                </span>
                <ScoreRing score={t.escapeScore} size={54} />
                <ChevronRight size={17} style={{ color: "var(--ca-night-muted)" }} />
              </Link>
            ))}
          </Card>
        )}

        {/* Rejected */}
        {engine && engine.rejected.length > 0 && (
          <Card pad data-tour="activity.rejected">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span className="ca-eyebrow" style={{ color: "var(--ca-gold-400)" }}>
                Rejected
              </span>
              <span style={{ fontSize: "var(--ca-t-xs)", color: "var(--ca-night-muted)" }}>
                {engine.rejected.length} of {engine.scanned}
              </span>
            </div>
            <div style={{ marginTop: "var(--ca-2)" }}>
              {engine.rejected.map((r) => (
                <div
                  key={r.offerId}
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "var(--ca-4) 0",
                    borderTop: "1px solid var(--ca-night-line)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--ca-3)",
                    }}
                  >
                    <span
                      className="ca-serif"
                      style={{ fontSize: "var(--ca-t-base)", color: "var(--ca-night-text)" }}
                    >
                      {r.destinationName}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--ca-gold-300)",
                        border: "1px solid var(--ca-night-line)",
                        borderRadius: "var(--ca-r-full)",
                        padding: "4px 9px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.rule}
                    </span>
                  </div>
                  <span style={{ fontSize: "var(--ca-t-xs)", color: "var(--ca-night-muted)" }}>
                    {r.detail}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: "var(--ca-4)", fontSize: "var(--ca-t-xs)", color: "var(--ca-night-muted)" }}>
              Every one of these is a pass/fail rule evaluated in ordinary code. No score, and no
              model, can overturn one.
            </p>
          </Card>
        )}

        {ready && (
          <div style={{ display: "flex", justifyContent: "center", gap: "var(--ca-3)" }}>
            <Pill tone="outline">
              <Clock size={13} /> Bounded: at most two replans, then a safe stop
            </Pill>
          </div>
        )}
      </div>
    </Screen>
  );
}
