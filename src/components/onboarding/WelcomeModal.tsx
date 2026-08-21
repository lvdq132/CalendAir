"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { WELCOME } from "@/lib/onboarding/content";
import { useOnboarding } from "./OnboardingProvider";
import { useFocusTrap, useScrollLock } from "./hooks";
import { CheckpointArt, OpeningArt, PrivacyArt } from "./WelcomeArt";
import { IconArrow, IconClose } from "./icons";

/**
 * The first thirty seconds.
 *
 * Three panels, in the order the questions actually arrive: what is this, how
 * do I use it, and what am I allowed to believe. Every one of them is one click
 * from being closed.
 */
export function WelcomeModal() {
  const { welcomeOpen, dismissWelcome, acceptTour } = useOnboarding();
  const [i, setI] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useScrollLock(welcomeOpen);
  useFocusTrap(panelRef, welcomeOpen);

  // Reopening always starts at the first panel.
  const [wasOpen, setWasOpen] = useState(welcomeOpen);
  if (wasOpen !== welcomeOpen) {
    setWasOpen(welcomeOpen);
    if (welcomeOpen) setI(0);
  }

  useEffect(() => {
    if (!welcomeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissWelcome();
      } else if (e.key === "ArrowRight") {
        setI((n) => Math.min(WELCOME.length - 1, n + 1));
      } else if (e.key === "ArrowLeft") {
        setI((n) => Math.max(0, n - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [welcomeOpen, dismissWelcome]);

  if (!welcomeOpen) return null;

  const panel = WELCOME[i];
  const last = i === WELCOME.length - 1;

  return (
    <div className="es-welcome">
      <div className="es-welcome__scrim" onClick={dismissWelcome} />

      <div
        ref={panelRef}
        className="es-welcome__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button
          type="button"
          className="es-welcome__close"
          aria-label="Close introduction"
          onClick={dismissWelcome}
        >
          <IconClose size={17} />
        </button>

        <div className="es-welcome__art">
          {panel.art === "opening" && <OpeningArt />}
          {panel.art === "privacy" && <PrivacyArt />}
          {panel.art === "checkpoint" && <CheckpointArt />}
        </div>

        <div className="es-welcome__copy">
          <span className="es-welcome__eyebrow">{panel.eyebrow}</span>
          <h2 id={titleId} className="es-welcome__title">
            {panel.title}
          </h2>
          <div className="es-welcome__body">
            {panel.body.map((p) => (
              <p key={p.slice(0, 28)}>{p}</p>
            ))}
          </div>

          {last && (
            <Link href="/onboarding" className="es-welcome__setup" onClick={dismissWelcome}>
              Or tell me your preferences first
            </Link>
          )}

          <div className="es-welcome__foot">
            <div className="es-welcome__steps">
              {WELCOME.map((p, n) => (
                <button
                  key={p.id}
                  type="button"
                  className={`es-welcome__step${n === i ? " is-active" : ""}`}
                  aria-label={`${p.title} (${n + 1} of ${WELCOME.length})`}
                  aria-current={n === i}
                  onClick={() => setI(n)}
                />
              ))}
            </div>

            <div className="es-welcome__actions">
              <button type="button" className="ca-btn ca-btn--quiet" onClick={dismissWelcome}>
                {last ? "I'll explore on my own" : "Skip"}
              </button>
              {last ? (
                <button type="button" className="ca-btn ca-btn--navy" onClick={acceptTour}>
                  Show me around
                  <IconArrow />
                </button>
              ) : (
                <button
                  type="button"
                  className="ca-btn ca-btn--navy"
                  onClick={() => setI((n) => n + 1)}
                >
                  Next
                  <IconArrow />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
