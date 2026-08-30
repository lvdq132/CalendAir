"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSession, type EngineSnapshot } from "@/components/calendair/SessionProvider";
import { ModeBadge, Screen } from "@/components/calendair/Screen";
import { DayStrip } from "@/components/calendair/DayStrip";
import { Check, ChevronRight, Clock, Pin, Refresh, Star } from "@/components/calendair/icons";
import { dateRange, duration, money } from "@/components/calendair/format";
import { OPPORTUNITY_LABEL } from "@/lib/calendair/scoring";
import { minutesBetween } from "@/lib/calendair/time";
import { DESTINATION_BY_IATA, ORIGIN_BY_IATA } from "@/lib/calendair/destinations";
import type { ScoredTrip } from "@/lib/calendair/types";

/** The recommendation desk: one decision, the agent state beside it, alternates below. */
export default function Home() {
  const { ready, world, engine, scan, scanning, error, booking } = useSession();
  const tried = useRef(false);

  useEffect(() => {
    if (!ready || !world || engine || scanning || tried.current) return;
    tried.current = true;
    void scan();
  }, [ready, world, engine, scanning, scan]);

  if (!ready || !world) {
    return (
      <Screen>
        <div className="ca-desktop-loading">
          <Star className="ca-pulse" /> Preparing your next escape…
        </div>
      </Screen>
    );
  }

  const { window: win, taste } = world;
  const origin = ORIGIN_BY_IATA[taste.originAirport];
  const hero = engine?.recommended ?? null;

  return (
    <Screen>
      <div className="ca-home">
        <header className="ca-home__intro">
          <div>
            <span className="ca-eyebrow">Curated for your open time</span>
            <h1 className="ca-display">Your next escape</h1>
          </div>
          <Link href="/settings" className="ca-origin-chip">
            <Pin size={14} /> {origin?.city} · {taste.originAirport}
            <ChevronRight size={14} />
          </Link>
        </header>

        <section className="ca-home__primary" aria-label="Recommended escape">
          <div className="ca-home__recommendation">
            {hero ? (
              <RecommendationHero trip={hero} />
            ) : scanning ? (
              <SearchingHero />
            ) : (
              <SearchStop
                error={error}
                unavailable={booking.state === "PROVIDER_UNAVAILABLE"}
                retry={() => void scan()}
              />
            )}
          </div>
          <AgentPanel engine={engine} scanning={scanning} windowHours={win.hours} />
        </section>

        <section className="ca-home__context">
          <div className="ca-window-bar">
            <div>
              <span className="ca-window-bar__value">{win.hours}h</span>
              <span>
                Free window
                <small>{dateRange(win.startIso, win.endIso, taste.originAirport)}</small>
              </span>
            </div>
            <div className="ca-window-bar__days">
              <DayStrip startIso={win.startIso} endIso={win.endIso} originIata={taste.originAirport} />
            </div>
          </div>
        </section>

        {engine && engine.alternates.length > 0 && (
          <section className="ca-home__alternates">
            <div className="ca-section-heading">
              <div>
                <span className="ca-eyebrow">Also ranked</span>
                <h2>More escapes that fit</h2>
              </div>
              <Link href="/activity" className="ca-link">
                How CALENDAIR ranked them <ChevronRight size={15} />
              </Link>
            </div>
            <div className="ca-alternate-grid">
              {engine.alternates.map((trip) => (
                <AlternateCard key={trip.id} trip={trip} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Screen>
  );
}

function RecommendationHero({ trip }: { trip: ScoredTrip }) {
  const dest = DESTINATION_BY_IATA[trip.destination];
  const flight = duration(minutesBetween(trip.outboundDepartureIso, trip.outboundArrivalIso));

  return (
    <article className="ca-recommendation">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dest?.photo} alt={trip.destinationName} className="ca-recommendation__image" />
      <div className="ca-recommendation__shade" />
      <div className="ca-recommendation__topline">
        <span>{OPPORTUNITY_LABEL[trip.opportunityType]}</span>
        <span className="ca-recommendation__score">
          <strong>{trip.escapeScore}</strong> CALENDAIR score
        </span>
      </div>
      <div className="ca-recommendation__content">
        <div>
          <span className="ca-recommendation__country">{trip.destinationCountry}</span>
          <h2>{trip.destinationName}</h2>
          <p>{trip.reasons[0] ?? trip.promise}</p>
        </div>
        <div className="ca-recommendation__metrics">
          <Metric label="Dates" value={dateRange(trip.outboundDepartureIso, trip.returnArrivalIso!, trip.origin)} />
          <Metric label="Travel time" value={flight} />
          <Metric label="Return fare" value={money(trip.totalPrice, trip.currency)} />
        </div>
        <Link href={`/opportunity/${trip.id}`} className="ca-btn ca-btn--primary ca-recommendation__cta">
          Explore {trip.destinationName} <ChevronRight size={17} />
        </Link>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function AgentPanel({
  engine,
  scanning,
  windowHours,
}: {
  engine: EngineSnapshot | null;
  scanning: boolean;
  windowHours: number;
}) {
  const complete = Boolean(engine?.recommended);
  const rows = [
    ["Calendar checked", `${windowHours}h opening`, true],
    ["Free window found", "Constraints applied", true],
    ["Flights scanned", engine ? `${engine.scanned} itineraries` : "In progress", Boolean(engine)],
    ["Preferences matched", engine ? `${engine.constraintsActive} hard rules` : "Waiting", complete],
    ["Fare verified", complete ? "Ready to review" : "Waiting", complete],
  ] as const;

  return (
    <aside className="ca-agent-panel">
      <div className="ca-agent-panel__head">
        <div>
          <span className="ca-eyebrow">CALENDAIR agent</span>
          <h2>{scanning ? "Scanning your weekend…" : complete ? "Escape ready" : "Standing by"}</h2>
        </div>
        <span className={`ca-agent-state${scanning ? " is-working" : ""}`}>
          <span /> {scanning ? "Working" : "Complete"}
        </span>
      </div>
      <div className="ca-agent-rows">
        {rows.map(([label, detail, done]) => (
          <div className={done ? "is-done" : undefined} key={label}>
            <span className="ca-agent-row__icon">{done ? <Check size={13} /> : <span />}</span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="ca-agent-panel__foot">
        <ModeBadge />
        <Link href="/activity">View activity <ChevronRight size={14} /></Link>
      </div>
    </aside>
  );
}

function AlternateCard({ trip }: { trip: ScoredTrip }) {
  const dest = DESTINATION_BY_IATA[trip.destination];
  const flight = duration(minutesBetween(trip.outboundDepartureIso, trip.outboundArrivalIso));
  return (
    <Link href={`/opportunity/${trip.id}`} className="ca-alternate">
      <span className="ca-alternate__image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dest?.photo} alt="" />
      </span>
      <span className="ca-alternate__copy">
        <span className="ca-alternate__top">
          <strong>{trip.destinationName}</strong>
          <em>{trip.escapeScore}</em>
        </span>
        <small>{trip.destinationCountry}</small>
        <span className="ca-alternate__meta">
          <b>{money(trip.totalPrice, trip.currency)}</b>
          <span><Clock size={13} /> {flight}</span>
          <ChevronRight size={16} />
        </span>
      </span>
    </Link>
  );
}

function SearchingHero() {
  return (
    <div className="ca-searching-hero">
      <Star size={30} className="ca-pulse" />
      <span className="ca-eyebrow">Calendar → Constraints → Atlas → Ranking</span>
      <h2>Finding the trip your time can hold.</h2>
      <div className="ca-searching-hero__line"><span /></div>
    </div>
  );
}

function SearchStop({
  error,
  unavailable,
  retry,
}: {
  error: string | null;
  unavailable: boolean;
  retry: () => void;
}) {
  return (
    <div className="ca-searching-hero">
      <Star size={28} />
      <span className="ca-eyebrow">{unavailable ? "Provider unavailable" : error ? "Search paused" : "Safe stop"}</span>
      <h2>{error ?? (unavailable ? "Atlas did not answer." : "No trip cleared every rule.")}</h2>
      <button type="button" className="ca-btn ca-btn--quiet ca-btn--sm" onClick={retry}>
        <Refresh size={15} /> Try again
      </button>
    </div>
  );
}
