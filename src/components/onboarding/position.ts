import type { Side } from "@/lib/onboarding/content";

export type Rect = { top: number; left: number; width: number; height: number };

export type Placement = {
  top: number;
  left: number;
  side: Side;
  /** Arrow offset along the card's edge, in px from its top-left corner. */
  arrow: number;
  /** False when no side had room and the card had to be docked over the anchor. */
  fits: boolean;
};

const MARGIN = 16;
const GAP = 12;
const ARROW_INSET = 22;

const SPACE: Record<Side, (a: Rect, vw: number, vh: number) => number> = {
  bottom: (a, _vw, vh) => vh - (a.top + a.height) - GAP - MARGIN,
  top: (a) => a.top - GAP - MARGIN,
  right: (a, vw) => vw - (a.left + a.width) - GAP - MARGIN,
  left: (a) => a.left - GAP - MARGIN,
};

const NEED: Record<Side, (w: number, h: number) => number> = {
  bottom: (_w, h) => h,
  top: (_w, h) => h,
  right: (w) => w,
  left: (w) => w,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Place a callout beside an anchor, flipping to whichever side actually has
 * room and clamping the result inside the viewport. Returns viewport
 * coordinates, for use with `position: fixed`.
 */
export function place(
  anchor: Rect,
  card: { width: number; height: number },
  preferred: Side = "bottom",
  viewport: { width: number; height: number },
): Placement {
  const { width: vw, height: vh } = viewport;
  const order: Side[] =
    preferred === "top" || preferred === "bottom"
      ? [preferred, preferred === "top" ? "bottom" : "top", "right", "left"]
      : [preferred, preferred === "left" ? "right" : "left", "bottom", "top"];

  const roomy = order.find((s) => SPACE[s](anchor, vw, vh) >= NEED[s](card.width, card.height));
  // Nothing fits beside the anchor — dock against whichever side is roomiest and
  // let the caller drop the arrow, so it reads as a floating note rather than a
  // tooltip pointing at the wrong thing.
  const side =
    roomy ??
    order.reduce((best, s) => (SPACE[s](anchor, vw, vh) > SPACE[best](anchor, vw, vh) ? s : best));

  const anchorCx = anchor.left + anchor.width / 2;
  const anchorCy = anchor.top + anchor.height / 2;

  let top: number;
  let left: number;

  if (side === "bottom" || side === "top") {
    left = clamp(anchorCx - card.width / 2, MARGIN, Math.max(MARGIN, vw - card.width - MARGIN));
    top =
      side === "bottom"
        ? anchor.top + anchor.height + GAP
        : anchor.top - card.height - GAP;
  } else {
    top = clamp(anchorCy - card.height / 2, MARGIN, Math.max(MARGIN, vh - card.height - MARGIN));
    left = side === "right" ? anchor.left + anchor.width + GAP : anchor.left - card.width - GAP;
  }

  top = clamp(top, MARGIN, Math.max(MARGIN, vh - card.height - MARGIN));
  left = clamp(left, MARGIN, Math.max(MARGIN, vw - card.width - MARGIN));

  const arrow =
    side === "bottom" || side === "top"
      ? clamp(anchorCx - left, ARROW_INSET, Math.max(ARROW_INSET, card.width - ARROW_INSET))
      : clamp(anchorCy - top, ARROW_INSET, Math.max(ARROW_INSET, card.height - ARROW_INSET));

  return { top, left, side, arrow, fits: roomy !== undefined };
}

/** Grow a rect by `pad` on every side, without letting it go negative. */
export function inflate(r: Rect, pad: number): Rect {
  return {
    top: r.top - pad,
    left: r.left - pad,
    width: Math.max(0, r.width + pad * 2),
    height: Math.max(0, r.height + pad * 2),
  };
}

/** True when two rects differ by more than half a pixel on any edge. */
export function rectChanged(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return false;
  if (!a || !b) return true;
  return (
    Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5
  );
}
