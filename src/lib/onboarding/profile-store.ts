import { sanitiseProfile, type TravellerProfile } from "@/lib/calendair/profile";

/**
 * The traveller's own profile, held in the browser.
 *
 * Same shape of store as the coach-mark state next door, and for the same reason:
 * reading localStorage during render breaks hydration, and reading it in an effect
 * costs a second pass plus a visible flash. The server snapshot reports
 * `ready: false`, so a screen renders nothing until the real answer is available.
 *
 * Only a *finished* profile is ever written here. Everything read back out is put
 * through `sanitiseProfile`, so a hand-edited localStorage entry cannot introduce
 * a preference the domain would not have accepted.
 */

export type ProfileState = {
  /** False on the server and during hydration; true once the store is readable. */
  ready: boolean;
  /** Null until onboarding has been completed at least once. */
  profile: TravellerProfile | null;
};

const KEY = "calendair.profile.v1";

const EMPTY: ProfileState = { ready: true, profile: null };
const SERVER: ProfileState = { ready: false, profile: null };

let cache: ProfileState | null = null;
const listeners = new Set<() => void>();

function readStorage(): ProfileState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = sanitiseProfile(JSON.parse(raw));
    // A profile with no completion instant is not a profile the engine may use.
    return parsed.completedAt ? { ready: true, profile: parsed } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getSnapshot(): ProfileState {
  if (!cache) cache = readStorage();
  return cache;
}

export function getServerSnapshot(): ProfileState {
  return SERVER;
}

/**
 * Read the stored profile outside React.
 *
 * The session provider needs this synchronously, before its first request, so the
 * engine runs on the traveller's rules rather than on the demo profile followed by
 * a correction.
 */
export function readProfile(): TravellerProfile | null {
  if (typeof window === "undefined") return null;
  return getSnapshot().profile;
}

function publish(next: ProfileState) {
  cache = next;
  listeners.forEach((l) => l());
}

/** Persist a finished profile, stamping the completion instant. */
export function saveProfile(profile: TravellerProfile): TravellerProfile {
  const completed = sanitiseProfile({
    ...profile,
    completedAt: profile.completedAt ?? new Date().toISOString(),
  });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(completed));
  } catch {
    // Private browsing or a full quota: the profile still drives this session, it
    // just will not survive a reload.
  }
  publish({ ready: true, profile: completed });
  return completed;
}

/** Forget the profile and go back to the prepared demo traveller. */
export function clearProfile(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the in-memory state below is what the app reads next.
  }
  publish(EMPTY);
}
