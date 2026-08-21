"use client";

import Link from "next/link";
import { useSession } from "@/components/calendair/SessionProvider";
import { Screen } from "@/components/calendair/Screen";
import { Card, Medallion, Pill } from "@/components/calendair/ui";
import { DayLegend, DayStrip } from "@/components/calendair/DayStrip";
import { Clock, Lock, Plane, Star, Sun, Users } from "@/components/calendair/icons";
import { dateRange, localDay, localTime } from "@/components/calendair/format";
import { formatInZone, overlaps } from "@/lib/calendair/time";
import { ORIGIN_BY_IATA } from "@/lib/calendair/destinations";

/**
 * The window, examined.
 *
 * This screen exists to make one claim checkable: the agent found this opening
 * from availability alone, and it can prove which blocks it looked at without
 * showing anyone else's.
 */
export default function CalendarScreen() {
  const { ready, world } = useSession();
  if (!ready || !world) {
    return (
      <Screen back="/">
        <Card pad style={{ color: "var(--ca-stone-500)" }}>Reading your calendar…</Card>
      </Screen>
    );
  }

  const { window: win, taste, companions, busy } = world;
  const zone = ORIGIN_BY_IATA[taste.originAirport]?.zone ?? "UTC";
  const shared = win.sharedWith.length > 0;
  const inWindow = (b: { startIso: string; endIso: string }) =>
    overlaps(b, { startIso: win.startIso, endIso: win.endIso });

  return (
    <Screen back="/">
      <div className="ca-stack">
        <Card pad data-tour="calendar.window">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--ca-4)" }}>
            <div>
              <div className="ca-display" style={{ fontSize: "var(--ca-t-2xl)", lineHeight: 1.05 }}>
                {win.hours} hours opened
              </div>
              <p style={{ margin: "6px 0 0", color: "var(--ca-stone-500)" }}>{win.subhead}</p>
            </div>
            <Pill tone="outline">{win.hours}-hour window</Pill>
          </div>

          <div style={{ marginTop: "var(--ca-5)" }}>
            <DayStrip startIso={win.startIso} endIso={win.endIso} originIata={taste.originAirport} />
            <DayLegend />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--ca-4)",
              marginTop: "var(--ca-4)",
              padding: "var(--ca-3) var(--ca-4)",
              background: "var(--ca-gold-100)",
              borderRadius: "var(--ca-r-sm)",
            }}
          >
            <span style={{ fontSize: "var(--ca-t-xs)" }}>
              <strong style={{ fontWeight: 600 }}>
                {localDay(win.startIso, taste.originAirport)} {localTime(win.startIso, taste.originAirport)}
              </strong>
              <span className="ca-muted"> — opens</span>
            </span>
            <span style={{ fontSize: "var(--ca-t-xs)" }}>
              <strong style={{ fontWeight: 600 }}>
                {localDay(win.endIso, taste.originAirport)} {localTime(win.endIso, taste.originAirport)}
              </strong>
              <span className="ca-muted"> — closes</span>
            </span>
          </div>
        </Card>

        {/* Companion overlap */}
        <Card pad data-tour="calendar.companion">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
            <Medallion tone={shared ? "sage" : "gold"}>
              <Users />
            </Medallion>
            <div style={{ minWidth: 0 }}>
              <div className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
                {shared ? "Both calendars fit" : "Not a shared opening"}
              </div>
              <span className="ca-label">
                {companions.map((c) => `${c.name} · ${c.relationship}`).join(" · ")}
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--ca-3)",
              alignItems: "flex-start",
              marginTop: "var(--ca-4)",
              paddingTop: "var(--ca-4)",
              borderTop: "1px solid var(--ca-line-soft)",
              color: "var(--ca-stone-500)",
              fontSize: "var(--ca-t-xs)",
            }}
          >
            <Lock size={15} style={{ color: "var(--ca-gold-600)", flexShrink: 0, marginTop: 1 }} />
            <span>
              Matched on free/busy only. CALENDAIR never requests, stores or displays another
              person&rsquo;s event titles — including to you.
            </span>
          </div>
        </Card>

        {/* Why this window */}
        <Card pad>
          <span className="ca-eyebrow">Why this window works</span>
          <div style={{ marginTop: "var(--ca-2)" }}>
            <Reason
              icon={<Plane size={16} />}
              title="Long enough to be worth it"
              body={`${win.hours} hours clear, end to end, with no commitment in the middle.`}
            />
            <Reason
              icon={<Sun size={16} />}
              title="Weekend heavy"
              body="Most of the opening falls on days that can actually be spent somewhere."
            />
            <Reason
              icon={<Clock size={16} />}
              title="Safe to come back from"
              body={`${Math.round(taste.returnBufferMinutes / 60)} hours of buffer are required before your next commitment.`}
            />
          </div>
        </Card>

        {/* Your own week */}
        <Card pad data-tour="calendar.busy">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
              Your week
            </span>
            <span className="ca-label">{dateRange(busy[0].startIso, busy[busy.length - 1].endIso, taste.originAirport)}</span>
          </div>
          <div style={{ marginTop: "var(--ca-3)" }}>
            {busy.map((b) => (
              <div
                key={b.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "84px minmax(0, 1fr) auto",
                  gap: "var(--ca-3)",
                  alignItems: "center",
                  padding: "var(--ca-3) 0",
                  borderTop: "1px solid var(--ca-line-soft)",
                }}
              >
                <span className="ca-label ca-num">
                  {formatInZone(b.startIso, zone, { weekday: "short", day: "numeric" })}{" "}
                  {localTime(b.startIso, taste.originAirport)}
                </span>
                <span
                  style={{
                    fontSize: "var(--ca-t-sm)",
                    textDecoration: b.released ? "line-through" : "none",
                    color: b.released ? "var(--ca-stone-400)" : "var(--ca-ink-700)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {b.title}
                </span>
                {b.released ? (
                  <Pill tone="sage">Released</Pill>
                ) : inWindow(b) ? (
                  <Pill tone="rose">Clashes</Pill>
                ) : (
                  <span className="ca-label">Busy</span>
                )}
              </div>
            ))}
          </div>
          <p className="ca-label" style={{ marginTop: "var(--ca-4)" }}>
            These are your own commitments, shown because they are yours. Nothing here was used to
            match availability beyond whether the time was taken.
          </p>
        </Card>

        <Link href="/" className="ca-btn ca-btn--quiet">
          <Star size={15} style={{ color: "var(--ca-gold-500)" }} /> Back to your escape
        </Link>
      </div>
    </Screen>
  );
}

function Reason({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0,1fr)",
        gap: "var(--ca-3)",
        alignItems: "start",
        padding: "var(--ca-3) 0",
        borderTop: "1px solid var(--ca-line-soft)",
      }}
    >
      <span style={{ color: "var(--ca-gold-600)", marginTop: 2 }}>{icon}</span>
      <span>
        <span style={{ display: "block", fontWeight: 500, fontSize: "var(--ca-t-sm)" }}>{title}</span>
        <span className="ca-label" style={{ whiteSpace: "normal" }}>
          {body}
        </span>
      </span>
    </div>
  );
}
