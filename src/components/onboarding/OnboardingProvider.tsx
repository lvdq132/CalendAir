"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { TourRoute } from "@/lib/onboarding/routes";
import { TOUR, TOUR_TOTAL } from "@/lib/onboarding/content";
import { getServerSnapshot, getSnapshot, subscribe, update } from "@/lib/onboarding/store";

export type GuideTab = "how" | "atlas" | "stages" | "glossary" | "questions";

type GuideState = { open: boolean; tab: GuideTab; term: string | null };

type Onboarding = {
  /** False until the browser store is readable, so nothing flashes on hydration. */
  ready: boolean;
  welcomeOpen: boolean;
  openWelcome: () => void;
  dismissWelcome: () => void;
  /** Finish the introduction and switch the coach marks on. */
  acceptTour: () => void;
  tourOn: boolean;
  endTour: () => void;
  restartTour: () => void;
  screenTourDone: (screen: TourRoute) => boolean;
  completeScreenTour: (screen: TourRoute) => void;
  guide: GuideState;
  openGuide: (tab?: GuideTab, term?: string) => void;
  closeGuide: () => void;
  replayEverything: () => void;
  progress: { done: number; total: number };
};

const Ctx = createContext<Onboarding | null>(null);

export function useOnboarding(): Onboarding {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [guide, setGuide] = useState<GuideState>({ open: false, tab: "how", term: null });

  // `null` means "whatever the stored state implies"; a boolean is an explicit
  // open or close from this session.
  const [welcomeOverride, setWelcomeOverride] = useState<boolean | null>(null);

  const ready = stored.ready;
  const welcomeOpen = ready && (welcomeOverride ?? !stored.welcomed);

  const openWelcome = useCallback(() => setWelcomeOverride(true), []);

  const dismissWelcome = useCallback(() => {
    setWelcomeOverride(false);
    // Skipping the introduction also skips the coach marks; the guide stays one
    // keystroke away for anyone who changes their mind.
    update({ welcomed: true, tourOff: true });
  }, []);

  const acceptTour = useCallback(() => {
    setWelcomeOverride(false);
    update({ welcomed: true, tourOff: false, tourDone: [] });
  }, []);

  const endTour = useCallback(() => update({ tourOff: true }), []);

  const restartTour = useCallback(() => {
    setGuide((g) => ({ ...g, open: false }));
    update({ welcomed: true, tourOff: false, tourDone: [] });
  }, []);

  const completeScreenTour = useCallback((screen: TourRoute) => {
    const done = getSnapshot().tourDone;
    if (done.includes(screen)) return;
    update({ tourDone: [...done, screen] });
  }, []);

  const screenTourDone = useCallback(
    (screen: TourRoute) => stored.tourDone.includes(screen),
    [stored.tourDone],
  );

  const openGuide = useCallback((tab: GuideTab = "how", term?: string) => {
    setGuide({ open: true, tab, term: term ?? null });
  }, []);

  const closeGuide = useCallback(() => setGuide((g) => ({ ...g, open: false })), []);

  const replayEverything = useCallback(() => {
    setGuide((g) => ({ ...g, open: false }));
    update({ welcomed: false, tourOff: false, tourDone: [] });
    setWelcomeOverride(true);
  }, []);

  // `?` opens the guide from anywhere that is not a text field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      setWelcomeOverride(false);
      setGuide((g) => (g.open ? { ...g, open: false } : { open: true, tab: "how", term: null }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const progress = useMemo(() => {
    const done = stored.tourDone.reduce((n, s) => n + (TOUR[s]?.length ?? 0), 0);
    return { done, total: TOUR_TOTAL };
  }, [stored.tourDone]);

  const value = useMemo<Onboarding>(
    () => ({
      ready,
      welcomeOpen,
      openWelcome,
      dismissWelcome,
      acceptTour,
      tourOn: stored.welcomed && !stored.tourOff,
      endTour,
      restartTour,
      screenTourDone,
      completeScreenTour,
      guide,
      openGuide,
      closeGuide,
      replayEverything,
      progress,
    }),
    [
      ready,
      welcomeOpen,
      openWelcome,
      dismissWelcome,
      acceptTour,
      stored.welcomed,
      stored.tourOff,
      endTour,
      restartTour,
      screenTourDone,
      completeScreenTour,
      guide,
      openGuide,
      closeGuide,
      replayEverything,
      progress,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
