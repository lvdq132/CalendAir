import { TOUR_ROUTES, type TourRoute } from "./routes";

/**
 * What the browser remembers about a traveller's onboarding, held as a tiny
 * external store.
 *
 * Reading localStorage during render would break hydration, and reading it in an
 * effect costs a second render pass plus a visible flash. `useSyncExternalStore`
 * is the API built for exactly this: the server (and the hydration pass) sees
 * `ready: false` and renders nothing, and the real state arrives immediately
 * afterwards without a mismatch.
 */
export type OnboardingState = {
  /** False on the server and during hydration; true once the store is readable. */
  ready: boolean;
  /** The first-run introduction has been read or dismissed. */
  welcomed: boolean;
  /** Screens whose coach marks have been finished. */
  tourDone: TourRoute[];
  /** The traveller turned the coach marks off. */
  tourOff: boolean;
};

const KEY = "calendair.onboarding.v1";
/** The pre-rebrand key. Read once so a returning traveller keeps their progress. */
const LEGACY_KEY = "empty-seat.onboarding.v1";

export const BLANK: OnboardingState = {
  ready: true,
  welcomed: false,
  tourDone: [],
  tourOff: false,
};

const SERVER: OnboardingState = { ...BLANK, ready: false };

let cache: OnboardingState | null = null;
const listeners = new Set<() => void>();

function readStorage(): OnboardingState {
  try {
    let raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // Migrate the Empty Seat key forward, then retire it, so the rename costs
      // nobody their finished coach marks.
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        window.localStorage.setItem(KEY, legacy);
        window.localStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }
    if (!raw) return BLANK;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      ready: true,
      welcomed: parsed.welcomed === true,
      tourOff: parsed.tourOff === true,
      tourDone: Array.isArray(parsed.tourDone)
        ? parsed.tourDone.filter((s): s is TourRoute => TOUR_ROUTES.includes(s as TourRoute))
        : [],
    };
  } catch {
    return BLANK;
  }
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getSnapshot(): OnboardingState {
  if (!cache) cache = readStorage();
  return cache;
}

export function getServerSnapshot(): OnboardingState {
  return SERVER;
}

export function update(patch: Partial<Omit<OnboardingState, "ready">>): void {
  const next: OnboardingState = { ...getSnapshot(), ...patch, ready: true };
  cache = next;
  try {
    // `ready` is a rendering concern, not something worth remembering.
    const { welcomed, tourDone, tourOff } = next;
    window.localStorage.setItem(KEY, JSON.stringify({ welcomed, tourDone, tourOff }));
  } catch {
    // Private browsing, a full quota or a disabled store: onboarding still
    // works, it just forgets between reloads.
  }
  listeners.forEach((l) => l());
}
