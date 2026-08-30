"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "./SessionProvider";
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
  const pathname = usePathname();
  const { world } = useSession();
  const route = pathname.split("/").filter(Boolean)[0] ?? "discover";
  const profileLabel = world?.taste.travellerName || "A";

  return (
    <div className={`ca-shell ca-route--${route}${night ? " ca-shell--night" : ""}`}>
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
          ) : undefined
        }
        right={
          right ?? (
            <Link href="/activity" className="ca-iconbtn" aria-label="Agent activity">
              <Bell />
              <span className="ca-iconbtn__dot" />
            </Link>
          )
        }
        profileLabel={profileLabel}
      />
      <main className="ca-main">{children}</main>
      <Footer />
    </div>
  );
}

/** The provider mode, stated rather than implied. Never says "live" when it isn't. */
export function ModeBadge() {
  const { atlas, scenario } = useSession();
  if (!atlas) return null;

  // Any mode that can search but cannot ticket — hybrid always (ticketing is
  // demo-backed by design), or skill mode while the account's ticketing
  // entitlement is blocked (TICKETING_ACTIVATION_REQUIRED) — mixes a live
  // capability with one that verifiably cannot execute a call. It must never
  // earn the same full "live" green as a mode where everything is actually
  // live end to end, or the badge itself becomes the dishonest claim.
  const isPartialLive = atlas.authorized && !atlas.ticketingAvailable;
  const neutral = atlas.adapter === "demo" || isPartialLive;
  const tone = neutral ? "" : atlas.authorized ? " ca-mode--live" : " ca-mode--warn";
  const dot = neutral
    ? "var(--ca-gold-500)"
    : atlas.authorized
      ? "var(--ca-sage-500)"
      : "var(--ca-rose-600)";

  return (
    <Link href="/demo" className={`ca-mode${tone}`}>
      <span className="ca-dot" style={{ background: dot }} />
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
