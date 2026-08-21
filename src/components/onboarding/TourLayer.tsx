"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { TourRoute } from "@/lib/onboarding/routes";
import { TOUR } from "@/lib/onboarding/content";
import { useOnboarding } from "./OnboardingProvider";
import { useAnchorRect, useMeasure, usePrefersReducedMotion, useViewport } from "./hooks";
import { inflate, place } from "./position";

/**
 * Coach marks, taught in place.
 *
 * Deliberately non-blocking: the spotlight is decoration and the page underneath
 * stays fully clickable, so a live demo never has to fight the tour. Each screen
 * carries its own short sequence and is remembered once finished, which means
 * the traveller meets each idea at the moment it first matters rather than in
 * one long lecture at the door.
 */
export function TourLayer({ screen }: { screen: TourRoute }) {
  const { tourOn, screenTourDone, completeScreenTour, endTour, guide, welcomeOpen, progress } =
    useOnboarding();
  const steps = TOUR[screen] ?? [];
  const [index, setIndex] = useState(0);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const titleId = useId();
  const viewport = useViewport();
  const reduced = usePrefersReducedMotion();

  const blocked = guide.open || welcomeOpen;
  const finished = screenTourDone(screen);
  const active = tourOn && !finished && steps.length > 0 && !blocked;
  const safeIndex = Math.min(index, Math.max(0, steps.length - 1));
  const step = active ? steps[safeIndex] : null;

  const rect = useAnchorRect(step?.anchor ?? null);
  const card = useMeasure(cardEl);

  const last = safeIndex >= steps.length - 1;

  const next = useCallback(() => {
    if (last) completeScreenTour(screen);
    else setIndex((i) => i + 1);
  }, [last, completeScreenTour, screen]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Restart the sequence whenever the traveller moves to another screen. Adjusted
  // during render rather than in an effect, so the new screen never paints a
  // frame of the previous screen's step.
  const [lastScreen, setLastScreen] = useState(screen);
  if (lastScreen !== screen) {
    setLastScreen(screen);
    setIndex(0);
  }

  // Bring the thing being described into view, leaving somewhere for the callout
  // to sit. Tall anchors are pushed near the top of the viewport so the card has
  // room underneath; short ones settle a third of the way down.
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(step.anchor)}"]`);
    if (!el) return;
    const box = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const wanted = box.height > vh * 0.38 ? 96 : Math.min((vh - box.height) / 2, vh * 0.34);
    const delta = box.top - wanted;
    if (Math.abs(delta) > 4) {
      window.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
    }
  }, [step, reduced]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        endTour();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, endTour]);

  // This screen is taught; say where the tour goes next without blocking anything.
  if (tourOn && !blocked && finished && steps.length > 0) {
    const complete = progress.done >= progress.total;
    return (
      <div className="es-tourchip" role="status">
        <span>
          Guided tour{" "}
          <span className="es-tourchip__count">
            {progress.done}/{progress.total}
          </span>
        </span>
        <span style={{ color: "var(--ca-stone-400)" }}>
          {complete ? "That is the whole tour" : "Continues on the next screen"}
        </span>
        <button type="button" className="es-tour__skip" onClick={endTour}>
          {complete ? "Dismiss" : "End tour"}
        </button>
      </div>
    );
  }

  if (!step) return null;

  const spot = rect ? inflate(rect, step.pad ?? 6) : null;
  const placed = spot && card.height > 0 ? place(spot, card, step.side ?? "bottom", viewport) : null;

  const cardStyle: React.CSSProperties = placed
    ? { top: placed.top, left: placed.left }
    : {
        top: Math.max(16, viewport.height / 2 - card.height / 2),
        left: Math.max(16, viewport.width / 2 - card.width / 2),
      };

  return (
    <div className="es-tour">
      {spot ? (
        <>
          <div
            className="es-tour__halo"
            style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          />
          <div
            className="es-tour__spot"
            style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          />
        </>
      ) : (
        <div className="es-tour__blanket" />
      )}

      <div
        ref={setCardEl}
        className="es-tour__card"
        role="dialog"
        aria-labelledby={titleId}
        data-side={placed?.side ?? "bottom"}
        style={{ ...cardStyle, visibility: card.height > 0 ? "visible" : "hidden" }}
      >
        {placed?.fits && (
          <span
            className="es-tour__arrow"
            style={
              placed.side === "top" || placed.side === "bottom"
                ? { left: placed.arrow - 6 }
                : { top: placed.arrow - 6 }
            }
          />
        )}

        <div className="es-tour__eyebrow">
          <span>{step.eyebrow}</span>
          <span className="es-tour__count">
            {safeIndex + 1} / {steps.length}
          </span>
        </div>

        <h2 id={titleId} className="es-tour__title">
          {step.title}
        </h2>
        <p className="es-tour__body">{step.body}</p>

        <div className="es-tour__foot">
          <div className="es-tour__dots">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`es-tour__dot${
                  i === safeIndex ? " is-active" : i < safeIndex ? " is-done" : ""
                }`}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === safeIndex}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>

          <div className="es-tour__actions">
            <button type="button" className="es-tour__skip" onClick={endTour}>
              Skip tour
            </button>
            {safeIndex > 0 && (
              <button type="button" className="ca-btn ca-btn--quiet ca-btn--sm" onClick={back}>
                Back
              </button>
            )}
            <button type="button" className="ca-btn ca-btn--navy ca-btn--sm" onClick={next}>
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
