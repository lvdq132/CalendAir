"use client";

import { Star } from "@/components/calendair/icons";

/* Three small drawings, each making one claim in the introduction visible. */

/** A week with one commitment released, and the gap it left. */
export function OpeningArt() {
  const days = [
    { d: "Wed", blocks: [1, 1, 0] },
    { d: "Thu", blocks: [1, 0, 1] },
    { d: "Fri", blocks: [1, 2, 2] },
    { d: "Sat", blocks: [2, 2, 2] },
    { d: "Sun", blocks: [2, 2, 2] },
    { d: "Mon", blocks: [1, 1, 0] },
  ];
  return (
    <div className="es-art">
      <div className="es-art__week">
        {days.map((day) => (
          <div key={day.d} className="es-art__col">
            <span className="es-art__dow">{day.d}</span>
            {day.blocks.map((b, i) => (
              <span
                key={i}
                className={`es-art__block${b === 1 ? " is-busy" : b === 2 ? " is-open" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="es-art__headline">
        <Star size={15} />
        <strong>68 hours</strong> opened
      </div>
      <p className="es-art__note">A Friday commitment was released. Nobody searched for anything.</p>
    </div>
  );
}

/** Two calendars compared on availability alone. */
export function PrivacyArt() {
  const rows: { who: string; label: string; cells: (0 | 1)[] }[] = [
    { who: "You", label: "titles visible to you", cells: [1, 1, 0, 0, 0, 0, 1] },
    { who: "Sophie", label: "free/busy only", cells: [1, 0, 0, 0, 0, 0, 1] },
  ];
  return (
    <div className="es-art">
      {rows.map((r) => (
        <div key={r.who} className="es-art__row">
          <div className="es-art__rowhead">
            <span className="es-art__who">{r.who}</span>
            <span className="es-art__note" style={{ margin: 0 }}>
              {r.label}
            </span>
          </div>
          <div className="es-art__cells">
            {r.cells.map((c, i) => (
              <span key={i} className={`es-art__cell${c ? " is-busy" : " is-free"}`} />
            ))}
          </div>
        </div>
      ))}
      <div className="es-art__overlap">
        <Star size={13} />
        Shared opening · both free
      </div>
      <p className="es-art__note">
        No event titles cross between two people. The match works exactly as well without them.
      </p>
    </div>
  );
}

/** Who decides what, at each step. */
export function CheckpointArt() {
  const steps: { label: string; by: "agent" | "you" | "airline" }[] = [
    { label: "Search live inventory", by: "agent" },
    { label: "Authorise this escape", by: "you" },
    { label: "Re-read the live fare", by: "agent" },
    { label: "Accept any price change", by: "you" },
    { label: "Confirm payment", by: "you" },
    { label: "Return a confirmed ticket", by: "airline" },
    { label: "Write your calendar", by: "agent" },
  ];
  return (
    <div className="es-art">
      <ul className="es-art__steps">
        {steps.map((s) => (
          <li key={s.label} className={`es-art__step is-${s.by}`}>
            <span className="es-art__pip" />
            <span>{s.label}</span>
            <span className="es-art__by">{s.by === "you" ? "you" : s.by}</span>
          </li>
        ))}
      </ul>
      <p className="es-art__note">Nothing that costs money happens without one of the gold steps.</p>
    </div>
  );
}
