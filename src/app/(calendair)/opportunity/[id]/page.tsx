"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/calendair/SessionProvider";
import { Screen } from "@/components/calendair/Screen";
import { Card, Medallion, Pill, ScoreRing, Stat, Stats } from "@/components/calendair/ui";
import { DayLegend, DayStrip } from "@/components/calendair/DayStrip";
import {
  CalendarIcon,
  Check,
  ChevronRight,
  Heart,
  Plane,
  Share,
  ShieldCheck,
  Star,
  Users,
} from "@/components/calendair/icons";
import {
  cityName,
  dateRange,
  duration,
  localDate,
  localTime,
  money,
  placeName,
} from "@/components/calendair/format";
import { DESTINATION_BY_IATA } from "@/lib/calendair/destinations";
import { humaniseStay, minutesBetween, usefulTimeAtDestination } from "@/lib/calendair/time";
import { OPPORTUNITY_LABEL, scoreBand } from "@/lib/calendair/scoring";

/**
 * The escape, in full.
 *
 * One decision on this screen. Everything above the button exists so that
 * decision is made on real numbers: what it costs, how much of it is actually
 * time away, and how the score was arrived at.
 */
export default function OpportunityScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { ready, world, engine, tripById, authorize, explain, busy } = useSession();
  const [expanded, setExpanded] = useState(false);
  const [qwen, setQwen] = useState<string | null>(null);

  const trip = tripById(id);

  useEffect(() => {
    if (ready && engine && !trip) router.replace("/");
    // No scan has run in this session (a cold deep-link): the home screen owns
    // the search, so bounce there and let it populate the recommendation.
    if (ready && !engine) router.replace("/");
  }, [ready, engine, trip, router]);

  // Language-only enrichment. The deterministic reasons show regardless; this
  // upgrades the lead line if Qwen is configured, and quietly does nothing if not.
  const cachedExplanation = trip?.qwenExplanation ?? null;
  useEffect(() => {
    let live = true;
    if (!trip || cachedExplanation) return;
    explain(trip.id).then((text) => {
      if (live && text) setQwen(text);
    });
    return () => {
      live = false;
    };
  }, [trip, cachedExplanation, explain]);
  const shownExplanation = qwen ?? cachedExplanation;

  if (!ready || !world || !trip) {
    return (
      <Screen back="/">
        <Card pad style={{ color: "var(--ca-stone-500)" }}>Opening the escape…</Card>
      </Screen>
    );
  }

  const dest = DESTINATION_BY_IATA[trip.destination];
  const stay = usefulTimeAtDestination(
    trip.outboundArrivalIso,
    trip.returnDepartureIso!,
    dest?.zone ?? "UTC",
  );
  const outMinutes = minutesBetween(trip.outboundDepartureIso, trip.outboundArrivalIso);
  const shared = world.window.sharedWith.length > 0;

  async function onBook() {
    const outcome = await authorize(trip!.id);
    if (!outcome) return;
    router.push("/booking");
  }

  return (
    <Screen
      back="/"
      right={
        <button type="button" className="ca-iconbtn" aria-label="Share">
          <Share />
        </button>
      }
    >
      <div className="ca-stack">
        {/* Hero */}
        <div className="ca-hero" style={{ aspectRatio: "16 / 12" }} data-tour="opportunity.status">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dest?.photo} alt="" className="ca-hero__img" />
          <div className="ca-hero__scrim" />
          <div className="ca-hero__top">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--ca-2)", alignItems: "flex-start" }}>
              <Pill tone="gold">{OPPORTUNITY_LABEL[trip.opportunityType]}</Pill>
              <Pill tone="white">
                {trip.referenceOnly ? (
                  <>
                    <span className="ca-dot" style={{ background: "var(--ca-stone-400)" }} />
                    Reference price
                  </>
                ) : (
                  <>
                    <span className="ca-dot" style={{ background: "var(--ca-sage-500)" }} />
                    Bookable fare
                  </>
                )}
              </Pill>
            </div>
            <button type="button" className="ca-iconbtn" aria-label="Save">
              <Heart />
            </button>
          </div>
          <div className="ca-hero__bottom">
            <div className="ca-hero__city">{trip.destinationName}</div>
            <p className="ca-hero__promise">{trip.promise}</p>
          </div>
        </div>

        {/* Route + numbers */}
        <Card data-tour="opportunity.numbers">
          <div style={{ padding: "var(--ca-5) var(--ca-5) var(--ca-4)" }}>
            <div className="ca-route">
              <div>
                <span className="ca-label" style={{ display: "block" }}>
                  {cityName(trip.origin)}
                </span>
                <span className="ca-route__code">{trip.origin}</span>
              </div>
              <span className="ca-route__thread">
                <Plane size={17} />
              </span>
              <div style={{ textAlign: "right" }}>
                <span className="ca-label" style={{ display: "block" }}>
                  {cityName(trip.destination)}
                </span>
                <span className="ca-route__code">{trip.destination}</span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "var(--ca-2)",
                fontSize: "var(--ca-t-xs)",
                color: "var(--ca-stone-400)",
              }}
            >
              <span>{placeName(trip.origin)}</span>
              <span>{placeName(trip.destination)}</span>
            </div>
          </div>

          <hr className="ca-hr" />

          <Stats cols={2}>
            <Stat
              label="Price per person"
              value={
                <span>
                  {money(trip.totalPrice, trip.currency)}{" "}
                  <small className="ca-muted">{trip.currency}</small>
                </span>
              }
              hint={`${trip.cabin} · round trip`}
            />
            <Stat
              label="Useful time there"
              value={humaniseStay(stay.nights, stay.days)}
              hint={dateRange(trip.outboundArrivalIso, trip.returnDepartureIso!, trip.destination)}
            />
          </Stats>
          <hr className="ca-hr" />
          <Stats cols={2}>
            <Stat
              label="Return buffer"
              value={`~${Math.round(trip.returnBufferMinutes / 60)} hours`}
              hint="Before your next commitment"
            />
            <div className="ca-stat" style={{ alignItems: "center", justifyContent: "center" }}>
              <span className="ca-stat__label">Escape Score</span>
              <ScoreRing score={trip.escapeScore} size={66} />
            </div>
          </Stats>
        </Card>

        {/* Both calendars fit */}
        <Card pad>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
            <Medallion tone={shared ? "sage" : "gold"}>
              <Users />
            </Medallion>
            <div style={{ minWidth: 0 }}>
              <div className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
                {shared ? "Both calendars fit" : "Your calendar fits"}
              </div>
              <span className="ca-label">
                {dateRange(world.window.startIso, world.window.endIso, trip.origin)} · your optimal
                window
              </span>
            </div>
          </div>
          <div style={{ marginTop: "var(--ca-4)" }}>
            <DayStrip
              startIso={world.window.startIso}
              endIso={world.window.endIso}
              originIata={trip.origin}
              selectedIso={trip.outboundDepartureIso}
            />
            <DayLegend />
          </div>
        </Card>

        {/* Itinerary */}
        <Card pad>
          <span className="ca-eyebrow">Your itinerary</span>
          <div style={{ marginTop: "var(--ca-3)" }}>
            <Leg
              iso={trip.outboundDepartureIso}
              code={trip.origin}
              linked
              meta={`Duration ${duration(outMinutes)}`}
              flight={trip.outboundFlight}
            />
            <Leg iso={trip.outboundArrivalIso} code={trip.destination} />
            <div style={{ borderTop: "1px dashed var(--ca-line)", margin: "var(--ca-3) 0" }} />
            <Leg
              iso={trip.returnDepartureIso!}
              code={trip.destination}
              linked
              meta={`Duration ${duration(
                minutesBetween(trip.returnDepartureIso!, trip.returnArrivalIso!),
              )}`}
              flight={trip.returnFlight}
            />
            <Leg iso={trip.returnArrivalIso!} code={trip.origin} />
          </div>
        </Card>

        {/* Why this works */}
        <Card pad data-tour="opportunity.why">
          <span className="ca-eyebrow">Why this works</span>
          {shownExplanation && (
            <p
              className="ca-serif"
              style={{
                margin: "var(--ca-3) 0 0",
                fontSize: "var(--ca-t-md)",
                lineHeight: 1.4,
                color: "var(--ca-ink-900)",
              }}
            >
              &ldquo;{shownExplanation}&rdquo;
            </p>
          )}
          <ul style={{ listStyle: "none", margin: "var(--ca-3) 0 0", padding: 0, display: "grid", gap: "var(--ca-3)" }}>
            {trip.reasons.map((r) => (
              <li key={r} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: "var(--ca-3)" }}>
                <Check size={16} style={{ color: "var(--ca-sage-600)", marginTop: 2 }} />
                <span style={{ fontSize: "var(--ca-t-sm)" }}>{r}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="ca-link"
            style={{ marginTop: "var(--ca-4)" }}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Hide the score breakdown" : `How the ${trip.escapeScore} was reached`}
            <ChevronRight
              size={15}
              style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}
            />
          </button>

          {expanded && (
            <div style={{ marginTop: "var(--ca-4)", display: "grid", gap: "var(--ca-2)" }}>
              {trip.factors.map((f) => {
                const penalty = f.max < 0;
                const pct = penalty ? Math.abs(f.points / f.max) : f.points / f.max;
                return (
                  <div
                    key={f.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) 58px 62px",
                      alignItems: "center",
                      gap: "var(--ca-3)",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "var(--ca-t-sm)" }}>{f.label}</span>
                      <span className="ca-label" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.detail}
                      </span>
                    </span>
                    <span
                      style={{
                        height: 3,
                        borderRadius: 2,
                        background: "var(--ca-ivory-300)",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`,
                          background: penalty ? "var(--ca-rose-600)" : "var(--ca-gold-500)",
                        }}
                      />
                    </span>
                    <span className="ca-label ca-num" style={{ textAlign: "right" }}>
                      {f.points} / {f.max}
                    </span>
                  </div>
                );
              })}
              <p className="ca-label" style={{ marginTop: "var(--ca-2)" }}>
                Adds to {trip.escapeScore} — {scoreBand(trip.escapeScore).toLowerCase()}. Hard
                constraints were applied before any of this; nothing here could have saved a trip
                that failed one.
              </p>
            </div>
          )}
        </Card>

        {/* The checkpoint */}
        <div data-tour="opportunity.book">
          <button
            type="button"
            className="ca-btn ca-btn--gold"
            onClick={onBook}
            disabled={busy || trip.referenceOnly}
          >
            <Star size={16} />
            {busy ? "Rechecking…" : `Book escape ${money(trip.totalPrice, trip.currency)}`}
          </button>
          <p
            className="ca-label"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginTop: "var(--ca-3)",
            }}
          >
            <ShieldCheck size={14} style={{ color: "var(--ca-sage-600)" }} />
            The live fare is rechecked before anything is booked
          </p>
        </div>

        {engine && engine.alternates.length > 0 && (
          <Card pad>
            <span className="ca-eyebrow">Also viable</span>
            <div style={{ marginTop: "var(--ca-2)" }}>
              {engine.alternates.map((a) => (
                <Link
                  key={a.id}
                  href={`/opportunity/${a.id}`}
                  className="ca-row"
                  style={{ padding: "var(--ca-3) 0", borderTop: "1px solid var(--ca-line-soft)" }}
                >
                  <Medallion>
                    <CalendarIcon size={16} />
                  </Medallion>
                  <span>
                    <span className="ca-serif" style={{ display: "block", fontSize: "var(--ca-t-base)" }}>
                      {a.destinationName}
                    </span>
                    <span className="ca-label">
                      {money(a.totalPrice, a.currency)} · score {a.escapeScore}
                    </span>
                  </span>
                  <ChevronRight size={17} style={{ color: "var(--ca-stone-400)" }} />
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Screen>
  );
}

function Leg({
  iso,
  code,
  linked,
  meta,
  flight,
}: {
  iso: string;
  code: string;
  linked?: boolean;
  meta?: string;
  flight?: string;
}) {
  return (
    <div className={`ca-leg${linked ? " ca-leg--linked" : ""}`}>
      <span className="ca-leg__node">
        <Plane size={15} />
      </span>
      <span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="ca-leg__time ca-num">{localTime(iso, code)}</span>
          <span className="ca-label">{localDate(iso, code)}</span>
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="ca-leg__code">{code}</span>
          <span className="ca-leg__place">{placeName(code)}</span>
        </span>
      </span>
      <span className="ca-label" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {meta}
        {flight && (
          <span style={{ display: "block", color: "var(--ca-stone-400)" }}>{flight}</span>
        )}
      </span>
    </div>
  );
}
