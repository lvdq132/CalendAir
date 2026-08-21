"use client";

import { formatInZone, parse } from "@/lib/calendair/time";
import { zoneFor } from "./format";

/**
 * Seven days around the opening.
 *
 * Gold marks a day with open time, grey a day that is spoken for. That is the
 * only calendar signal the product ever needs, and showing it this plainly is
 * how the privacy claim becomes visible rather than asserted.
 */
export function DayStrip({
  startIso,
  endIso,
  originIata,
  selectedIso,
}: {
  startIso: string;
  endIso: string;
  originIata: string;
  selectedIso?: string;
}) {
  const zone = zoneFor(originIata);
  const dayMs = 24 * 60 * 60 * 1000;

  // Anchor two days before the opening so the window sits inside the week.
  const anchor = parse(startIso) - 2 * dayMs;
  const key = (t: number) =>
    formatInZone(new Date(t).toISOString(), zone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  const windowDays = new Set<string>();
  for (let t = parse(startIso); t <= parse(endIso); t += dayMs) windowDays.add(key(t));
  windowDays.add(key(parse(endIso)));

  const selectedKey = selectedIso ? key(parse(selectedIso)) : key(parse(startIso));

  return (
    <div className="ca-days">
      {Array.from({ length: 7 }, (_, i) => {
        const t = anchor + i * dayMs;
        const iso = new Date(t).toISOString();
        const k = key(t);
        const inWindow = windowDays.has(k);
        return (
          <div
            key={k}
            className={`ca-day${inWindow ? " is-inwindow is-open" : ""}${
              k === selectedKey ? " is-selected" : ""
            }`}
          >
            <span className="ca-day__dow">{formatInZone(iso, zone, { weekday: "short" })}</span>
            <span className="ca-day__num ca-num">
              {formatInZone(iso, zone, { day: "numeric" })}
            </span>
            <span className="ca-day__mark" />
          </div>
        );
      })}
    </div>
  );
}

export function DayLegend() {
  return (
    <div className="ca-legend">
      <span>
        <span className="ca-dot" style={{ background: "var(--ca-gold-500)" }} /> Open time
      </span>
      <span>
        <span className="ca-dot" style={{ background: "var(--ca-ivory-300)" }} /> Busy
      </span>
      <span>
        <span
          style={{
            width: 18,
            height: 3,
            borderRadius: 2,
            background: "var(--ca-ink-800)",
            display: "inline-block",
          }}
        />{" "}
        Selected
      </span>
    </div>
  );
}
