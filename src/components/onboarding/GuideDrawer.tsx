"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TOUR_ROUTES } from "@/lib/onboarding/routes";
import { ATLAS_STEPS, FAQ, GLOSSARY, HOW, STAGE_NOTES } from "@/lib/onboarding/content";
import { useOnboarding, type GuideTab } from "./OnboardingProvider";
import { useFocusTrap, useScrollLock } from "./hooks";
import { IconChevron, IconClose } from "./icons";

const TABS: { id: GuideTab; label: string }[] = [
  { id: "how", label: "How it works" },
  { id: "atlas", label: "The flight layer" },
  { id: "stages", label: "The screens" },
  { id: "glossary", label: "Glossary" },
  { id: "questions", label: "Questions" },
];

const SCORE_FORMULA = `escapeScore = calendarFit      (18)
            + usefulHours     (20)
            + budgetFit       (12)
            + fareValue       (10)
            + affinity        (16)
            + companion       (10)
            + convenience      (8)
            + returnSafety     (6)
            − friction     (up to 7)

Hard constraints are evaluated first and are pass/fail.
No score can overturn one of them.`;

/**
 * The manual, kept inside the product.
 *
 * Reachable from the top bar or by pressing "?" anywhere. It answers in the
 * order people ask: how the thing works, what each screen is for, what the
 * words mean, and then the sceptical questions.
 */
export function GuideDrawer() {
  const { guide, closeGuide, openGuide, replayEverything, restartTour, tourOn, progress } =
    useOnboarding();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [openQ, setOpenQ] = useState<string | null>(FAQ[0]?.id ?? null);
  const titleId = useId();

  useScrollLock(guide.open);
  useFocusTrap(panelRef, guide.open);

  useEffect(() => {
    if (!guide.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeGuide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guide.open, closeGuide]);

  // Arriving from an inline term: jump to it and mark it briefly.
  useEffect(() => {
    if (!guide.open || !guide.term || guide.tab !== "glossary") return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`#es-term-${guide.term}`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("is-target");
    const t = window.setTimeout(() => el.classList.remove("is-target"), 1600);
    return () => window.clearTimeout(t);
  }, [guide.open, guide.term, guide.tab]);

  // Reset scroll when moving between tabs.
  useEffect(() => {
    if (!guide.term) bodyRef.current?.scrollTo({ top: 0 });
  }, [guide.tab, guide.term]);

  if (!guide.open) return null;

  return (
    <div className="es-guide">
      <div className="es-guide__scrim" onClick={closeGuide} />

      <div
        ref={panelRef}
        className="es-guide__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="es-guide__head">
          <div>
            <h2 id={titleId} className="es-guide__title">
              How CALENDAIR works
            </h2>
            <p className="es-guide__sub">
              A calendar opening becomes a real, verified trip — with a person at every step that
              costs money.
            </p>
          </div>
          <button
            type="button"
            className="es-welcome__close" style={{ position: "static" }}
            aria-label="Close the guide"
            onClick={closeGuide}
          >
            <IconClose size={17} />
          </button>
        </div>

        <div className="es-guide__tabs" role="tablist" aria-label="Guide sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={guide.tab === t.id}
              className={`es-guide__tab${guide.tab === t.id ? " is-active" : ""}`}
              onClick={() => openGuide(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="es-guide__body" ref={bodyRef}>
          {guide.tab === "how" && (
            <div className="es-sec">
              {HOW.map((s) => (
                <section key={s.id} className="es-step">
                  <span className="es-step__n">{s.n}</span>
                  <div>
                    <h3 className="es-step__title">{s.title}</h3>
                    <p className="es-step__body">{s.body}</p>
                    {s.points && (
                      <ul className="es-step__points">
                        {s.points.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    )}
                    {s.id === "score" && <pre className="es-formula">{SCORE_FORMULA}</pre>}
                  </div>
                </section>
              ))}
            </div>
          )}

          {guide.tab === "atlas" && (
            <div className="es-sec">
              {ATLAS_STEPS.map((s, n) => (
                <section key={s.title} className="es-step">
                  <span className="es-step__n">{String(n + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="es-step__title">{s.title}</h3>
                    <p className="es-step__body">{s.body}</p>
                  </div>
                </section>
              ))}
            </div>
          )}

          {guide.tab === "stages" && (
            <div>
              {TOUR_ROUTES.map((screen, n) => (
                <section key={screen} className="es-stage">
                  <span className="es-stage__n">{String(n + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="es-stage__title">{STAGE_NOTES[screen].title}</h3>
                    <p className="es-stage__body">{STAGE_NOTES[screen].body}</p>
                  </div>
                </section>
              ))}
            </div>
          )}

          {guide.tab === "glossary" && (
            <div>
              {GLOSSARY.map((g) => (
                <section key={g.id} id={`es-term-${g.id}`} className="es-entry">
                  <h3 className="es-entry__term">{g.term}</h3>
                  <p className="es-entry__short">{g.short}</p>
                  <p className="es-entry__long">{g.long}</p>
                </section>
              ))}
            </div>
          )}

          {guide.tab === "questions" && (
            <div>
              {FAQ.map((q) => {
                const open = openQ === q.id;
                return (
                  <section key={q.id} className={`es-qa${open ? " is-open" : ""}`}>
                    <button
                      type="button"
                      className="es-qa__q"
                      aria-expanded={open}
                      onClick={() => setOpenQ(open ? null : q.id)}
                    >
                      {q.q}
                      <span className="es-qa__chev">
                        <IconChevron size={17} />
                      </span>
                    </button>
                    {open && (
                      <div className="es-qa__a">
                        {q.a.map((p) => (
                          <p key={p.slice(0, 28)}>{p}</p>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="es-guide__foot">
          <span className="es-guide__hint">
            Press <span className="es-kbd">?</span> any time
          </span>
          <div style={{ display: "flex", gap: "var(--ca-3)" }}>
            <button type="button" className="ca-btn ca-btn--quiet ca-btn--sm" onClick={replayEverything}>
              Replay the intro
            </button>
            <button type="button" className="ca-btn ca-btn--outline ca-btn--sm" onClick={restartTour}>
              {tourOn && progress.done > 0 ? "Restart the tour" : "Take the tour"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
