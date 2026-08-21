"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSession } from "@/components/calendair/SessionProvider";
import { ModeBadge, Screen, ScreenNav } from "@/components/calendair/Screen";
import { Card, Medallion, Pill, ScoreRing, Stat, Stats } from "@/components/calendair/ui";
import { DayLegend, DayStrip } from "@/components/calendair/DayStrip";
import {
  CalendarCheck,
  ChevronRight,
  Clock,
  Pin,
  Refresh,
  Star,
  Users,
} from "@/components/calendair/icons";
import { dateRange, money } from "@/components/calendair/format";
import { OPPORTUNITY_LABEL } from "@/lib/calendair/scoring";
import { usefulTimeAtDestination, humaniseStay } from "@/lib/calendair/time";
import { DESTINATION_BY_IATA, ORIGIN_BY_IATA } from "@/lib/calendair/destinations";

/**
 * The opportunity home.
 *
 * The traveller does not ask for anything here. The window is already detected
 * and the search already running by the time the screen settles, because the
 * whole premise is that the trip finds you.
 */
export default function Home() {
  const { ready, world, engine, scan, scanning, error, atlas, booking } = useSession();
  const tried = useRef(false);

  useEffect(() => {
    if (!ready || !world || engine || scanning || tried.current) return;
    tried.current = true;
    void scan();
  }, [ready, world, engine, scanning, scan]);

  if (!ready || !world) {
    return (
      <Screen>
        <Card pad style={{ textAlign: "center", color: "var(--ca-stone-500)" }}>
          Reading your calendar…
        </Card>
      </Screen>
    );
  }

  const { window: win, taste, companions } = world;
  const origin = ORIGIN_BY_IATA[taste.originAirport];
  const hero = engine?.recommended ?? null;
  const shared = win.sharedWith.length > 0;

  return (
    <Screen>
      <div className="ca-stack">
        {/* Home airport */}
        <Card>
          <Link href="/settings" className="ca-row" data-tour="home.origin">
            <Medallion>
              <Pin />
            </Medallion>
            <span>
              <span
                className="ca-serif"
                style={{ display: "block", fontSize: "var(--ca-t-md)", lineHeight: 1.25 }}
              >
                {origin?.city}, {origin?.country}
              </span>
              <span className="ca-label">
                Home airport · {origin?.airportName} ({taste.originAirport})
              </span>
            </span>
            <span className="ca-link">
              Change <ChevronRight size={15} />
            </span>
          </Link>
        </Card>

        {/* The opening */}
        <Card pad data-tour="home.opening">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-5)" }}>
            <Medallion size="lg">
              <Star size={24} />
            </Medallion>
            <div>
              <div className="ca-display" style={{ fontSize: "var(--ca-t-3xl)", lineHeight: 1 }}>
                {win.hours}{" "}
                <span style={{ fontSize: "var(--ca-t-lg)", fontWeight: 400 }}>hours opened</span>
              </div>
              <p style={{ margin: "6px 0 0", color: "var(--ca-stone-500)" }}>{win.subhead}</p>
            </div>
          </div>
          {companions.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ca-3)",
                marginTop: "var(--ca-5)",
                padding: "10px var(--ca-4)",
                border: "1px solid var(--ca-line)",
                borderRadius: "var(--ca-r-full)",
                color: shared ? "var(--ca-ink-700)" : "var(--ca-stone-400)",
              }}
            >
              <Users size={17} style={{ color: "var(--ca-gold-600)" }} />
              {shared
                ? `You + ${companions.map((c) => c.name).join(", ")}`
                : `${companions[0].name} is not free in this window`}
            </div>
          )}
        </Card>

        {/* The week */}
        <Card pad data-tour="home.calendar">
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "var(--ca-4)",
              marginBottom: "var(--ca-4)",
            }}
          >
            <span className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
              {dateRange(win.startIso, win.endIso, taste.originAirport)}
            </span>
            <Link href="/calendar" className="ca-link">
              View calendar <ChevronRight size={15} />
            </Link>
          </div>
          <DayStrip
            startIso={win.startIso}
            endIso={win.endIso}
            originIata={taste.originAirport}
          />
          <DayLegend />
        </Card>

        {/* What opened it */}
        {win.openedBy && (
          <Card flat>
            <Link href="/calendar" className="ca-row">
              <Medallion tone="sage">
                <CalendarCheck />
              </Medallion>
              <span>
                <span style={{ display: "block", fontWeight: 500 }}>
                  We found a free-time opening
                </span>
                <span className="ca-label">
                  {win.openedBy.title} was released · {dateRange(win.startIso, win.endIso, taste.originAirport)}
                </span>
              </span>
              <ChevronRight size={18} style={{ color: "var(--ca-stone-400)" }} />
            </Link>
          </Card>
        )}

        {/* The escape */}
        <div data-tour="home.hero">
          {hero ? (
            <HeroCard trip={hero} />
          ) : scanning ? (
            <SearchingCard />
          ) : booking.state === "PROVIDER_UNAVAILABLE" ? (
            <Card pad>
              <span className="ca-eyebrow">Provider unavailable</span>
              <p className="ca-serif" style={{ fontSize: "var(--ca-t-md)", margin: "8px 0 0" }}>
                We couldn&apos;t reach the flight provider.
              </p>
              <p className="ca-label" style={{ marginTop: 6, marginBottom: "var(--ca-4)" }}>
                This is not a statement about availability — Atlas didn&apos;t answer, even after
                retrying, so nothing was ruled out. Try again in a moment.
              </p>
              <button
                type="button"
                className="ca-btn ca-btn--quiet"
                onClick={() => {
                  tried.current = false;
                  void scan();
                }}
              >
                <Refresh size={16} /> Try again
              </button>
            </Card>
          ) : error ? (
            <Card pad>
              <span className="ca-eyebrow">Search failed</span>
              <p className="ca-serif" style={{ fontSize: "var(--ca-t-md)", margin: "8px 0" }}>
                {error}
              </p>
              <p className="ca-label" style={{ marginBottom: "var(--ca-4)" }}>
                {atlas?.adapter !== "demo"
                  ? "The live provider is selected but its adapter has not been implemented, so nothing was substituted."
                  : "No itinerary was returned."}
              </p>
              <button
                type="button"
                className="ca-btn ca-btn--quiet"
                onClick={() => {
                  tried.current = false;
                  void scan();
                }}
              >
                <Refresh size={16} /> Try again
              </button>
            </Card>
          ) : (
            <Card pad>
              <span className="ca-eyebrow">Safe stop</span>
              <p className="ca-serif" style={{ fontSize: "var(--ca-t-md)", margin: "8px 0 0" }}>
                Nothing cleared every rule you set.
              </p>
              <p className="ca-label" style={{ marginTop: 6 }}>
                The window stays open and the agent keeps watching. See{" "}
                <Link href="/activity" className="ca-link" style={{ fontSize: "inherit" }}>
                  what it rejected
                </Link>
                .
              </p>
            </Card>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center", paddingTop: "var(--ca-2)" }}>
          <ModeBadge />
        </div>
        <ScreenNav />
      </div>
    </Screen>
  );
}

function SearchingCard() {
  // The claim here has to match the adapter actually running, not the
  // aspiration — see ModeBadge in Screen.tsx for the same rule applied to
  // the badge. "demo" is deterministic inventory, never live Atlas data.
  const { atlas } = useSession();
  const live = atlas?.adapter === "hybrid" || atlas?.adapter === "skill";
  return (
    <Card pad className="ca-rise">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
        <Medallion>
          <Star size={18} className="ca-pulse" />
        </Medallion>
        <div>
          <div className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
            {live ? "Searching live inventory" : "Searching the prepared inventory"}
          </div>
          <span className="ca-label">
            {live
              ? "Reading real routes and fares for your window"
              : "Deterministic demo routes and fares — not live Atlas data"}
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: "var(--ca-5)" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="ca-pulse"
            style={{
              height: 10,
              borderRadius: 5,
              background: "var(--ca-ivory-200)",
              width: `${100 - i * 18}%`,
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
      <Link href="/activity" className="ca-link" style={{ marginTop: "var(--ca-5)" }}>
        Watch the agent work <ChevronRight size={15} />
      </Link>
    </Card>
  );
}

function HeroCard({ trip }: { trip: NonNullable<ReturnType<typeof useSession>["engine"]>["recommended"] }) {
  if (!trip) return null;
  const dest = DESTINATION_BY_IATA[trip.destination];
  const stay = usefulTimeAtDestination(
    trip.outboundArrivalIso,
    trip.returnDepartureIso!,
    dest?.zone ?? "UTC",
  );

  return (
    <Card className="ca-rise" style={{ overflow: "hidden" }}>
      <div className="ca-hero" style={{ borderRadius: 0, aspectRatio: "16 / 11" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dest?.photo} alt="" className="ca-hero__img" />
        <div className="ca-hero__scrim" />
        <div className="ca-hero__top">
          <Pill tone="gold">{OPPORTUNITY_LABEL[trip.opportunityType]}</Pill>
          <span className="ca-scorebadge">
            <ScoreRing score={trip.escapeScore} size={58} />
          </span>
        </div>
        <div className="ca-hero__bottom">
          <div className="ca-hero__city">{trip.destinationName}</div>
          <p className="ca-hero__promise">{trip.promise}</p>
        </div>
      </div>

      <Stats cols={2}>
        <Stat
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} style={{ color: "var(--ca-gold-600)" }} /> Useful time there
            </span>
          }
          value={<span style={{ fontSize: "var(--ca-t-md)" }}>{humaniseStay(stay.nights, stay.days)}</span>}
          hint={dateRange(trip.outboundArrivalIso, trip.returnDepartureIso!, trip.destination)}
        />
        <Stat
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Star size={13} style={{ color: "var(--ca-gold-500)" }} /> Return buffer
            </span>
          }
          value={
            <span style={{ fontSize: "var(--ca-t-md)" }}>
              ~{Math.round(trip.returnBufferMinutes / 60)} hours
            </span>
          }
          hint="Before your next commitment"
        />
      </Stats>

      <div style={{ padding: "0 var(--ca-5) var(--ca-5)" }}>
        <Link href={`/opportunity/${trip.id}`} className="ca-btn ca-btn--navy">
          <Star size={16} style={{ color: "var(--ca-gold-400)" }} />
          Explore escape
        </Link>
        <p
          className="ca-label"
          style={{ textAlign: "center", marginTop: "var(--ca-3)", marginBottom: 0 }}
        >
          {money(trip.totalPrice, trip.currency)} per person · {trip.stops === 0 ? "non-stop" : `${trip.stops} stop`} · {trip.cabin?.toLowerCase()}
        </p>
      </div>
    </Card>
  );
}
