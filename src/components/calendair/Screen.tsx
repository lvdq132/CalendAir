"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "./SessionProvider";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { Footer, TopBar } from "./ui";
import { Bell, ChevronLeft } from "./icons";

/**
 * Every screen is the same column: bar, content, provenance.
 *
 * `night` switches to the dark surface the agent activity view uses; it is the
 * only place in the product that goes dark, which is what makes it feel like
 * looking behind the curtain.
 */
export function Screen({
  children,
  back,
  night,
  right,
}: {
  children: ReactNode;
  back?: string | true;
  night?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  const { openGuide } = useOnboarding();

  return (
    <div className={`ca-shell${night ? " ca-shell--night" : ""}`}>
      <TopBar
        left={
          back ? (
            <button
              type="button"
              className="ca-iconbtn"
              aria-label="Back"
              onClick={() => (typeof back === "string" ? router.push(back) : router.back())}
            >
              <ChevronLeft />
            </button>
          ) : (
            <button
              type="button"
              className="ca-iconbtn"
              aria-label="How CALENDAIR works"
              onClick={() => openGuide("how")}
            >
              <span style={{ fontSize: 15, fontWeight: 600 }}>?</span>
            </button>
          )
        }
        right={
          right ?? (
            <Link href="/activity" className="ca-iconbtn" aria-label="Agent activity">
              <Bell />
              <span className="ca-iconbtn__dot" />
            </Link>
          )
        }
      />
      {children}
      <Footer />
    </div>
  );
}

/** The provider mode, stated rather than implied. Never says "live" when it isn't. */
export function ModeBadge() {
  const { atlas, scenario } = useSession();
  if (!atlas) return null;

  const tone =
    atlas.adapter === "demo" ? "" : atlas.authorized ? " ca-mode--live" : " ca-mode--warn";

  return (
    <Link href="/demo" className={`ca-mode${tone}`}>
      <span
        className="ca-dot"
        style={{
          background:
            atlas.adapter === "demo"
              ? "var(--ca-gold-500)"
              : atlas.authorized
                ? "var(--ca-sage-500)"
                : "var(--ca-rose-600)",
        }}
      />
      {atlas.label}
      <span style={{ opacity: 0.55 }}>· {scenario}</span>
    </Link>
  );
}

const LINKS = [
  { href: "/calendar", label: "Calendar" },
  { href: "/activity", label: "Agent activity" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/settings", label: "Preferences" },
  { href: "/demo", label: "Demo" },
];

export function ScreenNav() {
  return (
    <nav
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--ca-4)",
        justifyContent: "center",
        paddingTop: "var(--ca-6)",
      }}
    >
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          style={{
            fontSize: "var(--ca-t-xs)",
            color: "var(--ca-stone-500)",
            textDecoration: "none",
          }}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
