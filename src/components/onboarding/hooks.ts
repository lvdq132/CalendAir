"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { rectChanged, type Rect } from "./position";

/** `useLayoutEffect` that does not warn during server rendering. */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true from the first client render on. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// ── Viewport ─────────────────────────────────────────────────────────────────

type Size = { width: number; height: number };

const SERVER_SIZE: Size = { width: 0, height: 0 };
let viewportCache: Size = SERVER_SIZE;

function subscribeViewport(onChange: () => void) {
  const handle = () => {
    if (viewportCache.width !== window.innerWidth || viewportCache.height !== window.innerHeight) {
      viewportCache = { width: window.innerWidth, height: window.innerHeight };
    }
    onChange();
  };
  window.addEventListener("resize", handle);
  return () => window.removeEventListener("resize", handle);
}

function viewportSnapshot(): Size {
  if (viewportCache.width !== window.innerWidth || viewportCache.height !== window.innerHeight) {
    viewportCache = { width: window.innerWidth, height: window.innerHeight };
  }
  return viewportCache;
}

/** Current viewport size, cached so the snapshot reference stays stable. */
export function useViewport(): Size {
  return useSyncExternalStore(subscribeViewport, viewportSnapshot, () => SERVER_SIZE);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

// ── Measurement ──────────────────────────────────────────────────────────────

/**
 * Track the viewport rect of `[data-tour="<key>"]`.
 *
 * The page underneath animates, streams new rows into a log and re-lays out as
 * the market run progresses, so a resize observer alone misses moves. A rAF loop
 * with change detection is cheap and always right: it only sets state when the
 * rect has actually moved.
 */
export function useAnchorRect(key: string | null): Rect | null {
  // The key travels with the rect so a stale measurement from the previous
  // anchor can never be painted for a frame after the step changes.
  const [tracked, setTracked] = useState<{ key: string; rect: Rect } | null>(null);
  const last = useRef<Rect | null>(null);

  useEffect(() => {
    if (!key) return;
    last.current = null;

    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(key)}"]`);
      let next: Rect | null = null;
      if (el) {
        const r = el.getBoundingClientRect();
        // A zero-size box means the element exists but has not been laid out yet.
        if (r.width > 0 || r.height > 0) {
          next = { top: r.top, left: r.left, width: r.width, height: r.height };
        }
      }
      if (rectChanged(last.current, next)) {
        last.current = next;
        setTracked(next ? { key, rect: next } : null);
      }
    };

    let frame = 0;
    const loop = () => {
      measure();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // Animation frames stop entirely when the page is not being rendered, which
    // would leave the spotlight frozen wherever it happened to be. A slow timer
    // keeps it honest in that case, and costs one layout read a quarter-second.
    const timer = window.setInterval(measure, 250);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [key]);

  return tracked && tracked.key === key ? tracked.rect : null;
}

/**
 * Measure an element's own box, kept current through content changes.
 *
 * Takes the node rather than a ref: these elements mount and unmount as steps
 * change, and a ref object's identity never changes, so an effect keyed on it
 * would only ever run against whatever was on screen the first time.
 */
export function useMeasure(node: HTMLElement | null): Size {
  const [size, setSize] = useState<Size>(SERVER_SIZE);

  useIsomorphicLayoutEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - r.width) > 0.5 || Math.abs(prev.height - r.height) > 0.5
          ? { width: r.width, height: r.height }
          : prev,
      );
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return size;
}

// ── Dialog plumbing ──────────────────────────────────────────────────────────

/** Keep focus inside `ref` while `active`, and restore it on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const previous = document.activeElement as HTMLElement | null;
    const SELECTOR =
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    (focusables()[0] ?? root).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref, active]);
}

/** Lock body scrolling while a blocking surface is open. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { overflow, paddingRight } = document.body.style;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [active]);
}
