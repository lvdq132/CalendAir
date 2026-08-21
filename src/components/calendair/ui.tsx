"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { scoreBand } from "@/lib/calendair/scoring";
import { Star } from "./icons";

/* The pieces every CALENDAIR screen is assembled from. */

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="ca-wordmark" aria-label="CALENDAIR home">
      <Star size={16} className="ca-wordmark__star" />
      <span className="ca-wordmark__name">Calendair</span>
      <span className="ca-wordmark__tag">Your time, perfected.</span>
    </Link>
  );
}

export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="ca-topbar">
      <div>{left}</div>
      <Wordmark />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>{right}</div>
    </header>
  );
}

export function Card({
  children,
  flat,
  pad,
  className = "",
  style,
  ...rest
}: {
  children: ReactNode;
  flat?: boolean;
  pad?: boolean;
  className?: string;
  style?: CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ca-card${flat ? " ca-card--flat" : ""}${pad ? " ca-card--pad" : ""} ${className}`.trim()}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Medallion({
  children,
  tone = "gold",
  size = "md",
}: {
  children: ReactNode;
  tone?: "gold" | "sage";
  size?: "md" | "lg";
}) {
  return (
    <span
      className={`ca-medallion${tone === "sage" ? " ca-medallion--sage" : ""}${
        size === "lg" ? " ca-medallion--lg" : ""
      }`}
    >
      {children}
    </span>
  );
}

export function Pill({
  children,
  tone = "white",
}: {
  children: ReactNode;
  tone?: "gold" | "white" | "sage" | "rose" | "outline";
}) {
  return <span className={`ca-pill ca-pill--${tone}`}>{children}</span>;
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="ca-stat">
      <span className="ca-stat__label">{label}</span>
      <span className="ca-stat__value">{value}</span>
      {hint && <span className="ca-stat__hint">{hint}</span>}
    </div>
  );
}

export function Stats({ cols = 3, children }: { cols?: number; children: ReactNode }) {
  return (
    <div className="ca-stats" style={{ ["--ca-stats-cols" as string]: cols }}>
      {children}
    </div>
  );
}

/**
 * The Escape Score, drawn as an open ring.
 *
 * The arc is the score, so a 79 and a 92 are told apart before either number is
 * read — and the band underneath names it in words rather than leaving the
 * traveller to guess what "out of 100" means here.
 */
export function ScoreRing({ score, size = 74 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const arc = (Math.min(100, Math.max(0, score)) / 100) * c * 0.78;
  return (
    <div className="ca-score" style={{ width: size }}>
      <div className="ca-score__ring" style={{ width: size, height: size }}>
        <svg className="ca-score__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ca-ivory-300)"
            strokeWidth={2}
            strokeDasharray={`${c * 0.78} ${c}`}
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ca-gold-500)"
            strokeWidth={2.4}
            strokeDasharray={`${arc} ${c}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="ca-score__value ca-num">{score}</span>
      </div>
      <span className="ca-score__band">{scoreBand(score)}</span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="ca-footer">
      Powered by <strong>Atlas</strong>
      <span aria-hidden>×</span>
      <strong>Alibaba Cloud</strong>
    </footer>
  );
}

export function Sparkline({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Star size={15} style={{ color: "var(--ca-gold-400)" }} />
      {children}
    </span>
  );
}
