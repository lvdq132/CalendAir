"use client";

import Link from "next/link";
import { useSession } from "@/components/calendair/SessionProvider";
import { Screen } from "@/components/calendair/Screen";
import { Card, Medallion, Pill, Stat, Stats } from "@/components/calendair/ui";
import {
  CalendarCheck,
  Check,
  Clock,
  Plane,
  ShieldCheck,
  Star,
  Ticket,
  Users,
} from "@/components/calendair/icons";
import { duration, localDate, localTime, placeName } from "@/components/calendair/format";
import { humaniseStay, minutesBetween, usefulTimeAtDestination } from "@/lib/calendair/time";
import { DESTINATION_BY_IATA } from "@/lib/calendair/destinations";

/**
 * Confirmed — and only ever the word the provider earned.
 *
 * The Sandbox label is not a disclaimer bolted on at the end. It is the same
 * honesty that made the app refuse to say confirmed a moment earlier.
 */
export default function TripScreen() {
  const { ready, world, booking } = useSession();
  const v = booking.verified;
  const result = booking.result;

  if (!ready || !world || !v) {
    return (
      <Screen back="/">
        <Card pad>
          <span className="ca-eyebrow">No trip yet</span>
          <p className="ca-serif" style={{ fontSize: "var(--ca-t-md)", margin: "8px 0 var(--ca-4)" }}>
            Nothing has been booked in this session.
          </p>
          <Link href="/" className="ca-btn ca-btn--quiet">
            Back to your escape
          </Link>
        </Card>
      </Screen>
    );
  }

  const dest = DESTINATION_BY_IATA[v.destination];
  const stay = usefulTimeAtDestination(
    v.outboundArrivalIso,
    v.returnDepartureIso!,
    dest?.zone ?? "UTC",
  );
  const confirmed = result?.state === "confirmed";
  const travellers = world.window.sharedWith.length > 0 ? 2 : 1;
  const blocks = booking.calendarBlocks ?? [];

  return (
    <Screen back="/">
      <div className="ca-stack">
        <div style={{ textAlign: "center", paddingTop: "var(--ca-4)" }} data-tour="trip.truth">
          <Medallion tone={confirmed ? "sage" : "gold"} size="lg">
            {confirmed ? <Check size={26} /> : <Star size={24} className="ca-pulse" />}
          </Medallion>
          <h1
            className="ca-display"
            style={{ fontSize: "var(--ca-t-2xl)", margin: "var(--ca-4) 0 var(--ca-2)" }}
          >
            {confirmed ? "Your escape is confirmed." : "Awaiting confirmation."}
          </h1>
          <p style={{ margin: 0, color: "var(--ca-stone-500)" }}>
            {confirmed
              ? `Get ready for ${dest?.city}.`
              : "The provider has the request. Nothing is called confirmed until it says so."}
          </p>
          {result?.testMode && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--ca-4)" }}>
              <Pill tone="outline">
                <Ticket size={13} /> Sandbox test result · not a real booking
              </Pill>
            </div>
          )}
        </div>

        <Stats cols={3}>
          <Stat
            label="Total paid"
            value={
              <span>
                <small className="ca-muted">{v.currency} </small>
                {((booking.approvedTotal ?? v.totalPrice) * travellers).toLocaleString("en-US")}
              </span>
            }
            hint="All taxes and fees included"
          />
          <Stat
            label="Travel dates"
            value={
              <span style={{ fontSize: "var(--ca-t-base)" }}>
                {localDate(v.outboundDepartureIso, v.origin)} – {localDate(v.returnArrivalIso!, v.origin)}
              </span>
            }
            hint={`${humaniseStay(stay.nights, stay.days)} there`}
          />
          <Stat
            label="Travellers"
            value={<span style={{ fontSize: "var(--ca-t-base)" }}>{travellers} adult{travellers > 1 ? "s" : ""}</span>}
            hint={world.window.sharedWith.length > 0 ? "Shared opening" : "Solo escape"}
          />
        </Stats>

        {/* Calendar write-back */}
        <Card pad data-tour="trip.calendar">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
            <Medallion tone={blocks.length ? "sage" : "gold"}>
              <CalendarCheck />
            </Medallion>
            <div style={{ minWidth: 0 }}>
              <div className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
                {blocks.length ? "The blocks CALENDAIR would write" : "Calendar not written yet"}
              </div>
              <span className="ca-label">
                {blocks.length
                  ? "Generated after fulfilment was confirmed · held in this session, no external calendar connected"
                  : "Nothing is written before the provider confirms"}
              </span>
            </div>
          </div>

          {blocks.length > 0 && (
            <div style={{ marginTop: "var(--ca-4)" }}>
              {blocks.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "8px minmax(0,1fr) auto",
                    gap: "var(--ca-3)",
                    alignItems: "center",
                    padding: "var(--ca-3) 0",
                    borderTop: "1px solid var(--ca-line-soft)",
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 26,
                      borderRadius: 2,
                      background:
                        b.kind === "destination"
                          ? "var(--ca-gold-500)"
                          : b.kind === "buffer"
                            ? "var(--ca-ivory-300)"
                            : "var(--ca-ink-800)",
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "var(--ca-t-sm)" }}>{b.title}</span>
                    <span className="ca-label">
                      {localDate(b.startIso, b.startAt)} {localTime(b.startIso, b.startAt)} —{" "}
                      {localDate(b.endIso, b.endAt)} {localTime(b.endIso, b.endAt)}
                      <span style={{ color: "var(--ca-stone-400)" }}> · local</span>
                    </span>
                  </span>
                  {b.tentative ? <Pill tone="rose">Tentative</Pill> : <Check size={16} style={{ color: "var(--ca-sage-600)" }} />}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* What was booked */}
        <Card pad>
          <span className="ca-eyebrow">Flight</span>
          <div style={{ marginTop: "var(--ca-3)" }}>
            <Leg
              iso={v.outboundDepartureIso}
              code={v.origin}
              linked
              meta={duration(minutesBetween(v.outboundDepartureIso, v.outboundArrivalIso))}
              flight={v.outboundFlight}
            />
            <Leg iso={v.outboundArrivalIso} code={v.destination} />
            <div style={{ borderTop: "1px dashed var(--ca-line)", margin: "var(--ca-3) 0" }} />
            <Leg
              iso={v.returnDepartureIso!}
              code={v.destination}
              linked
              meta={duration(minutesBetween(v.returnDepartureIso!, v.returnArrivalIso!))}
              flight={v.returnFlight}
            />
            <Leg iso={v.returnArrivalIso!} code={v.origin} />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--ca-4)",
              marginTop: "var(--ca-4)",
              paddingTop: "var(--ca-4)",
              borderTop: "1px solid var(--ca-line-soft)",
            }}
          >
            <span className="ca-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Users size={14} style={{ color: "var(--ca-gold-600)" }} /> {v.cabin}
            </span>
            <span className="ca-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} style={{ color: "var(--ca-gold-600)" }} />{" "}
              {v.stops === 0 ? "Non-stop" : `${v.stops} stop`}
            </span>
            <span className="ca-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} style={{ color: "var(--ca-sage-600)" }} /> Verified{" "}
              {localTime(v.verifiedAtIso, v.origin)}
            </span>
          </div>
        </Card>

        {/* Provider truth */}
        <Card pad flat>
          <span className="ca-eyebrow">What the provider returned</span>
          <div style={{ marginTop: "var(--ca-3)", display: "grid", gap: "var(--ca-2)" }}>
            <KV k="State" v={result?.state ?? "unknown"} />
            <KV k="Status label" v={result?.rawStatusLabel ?? "—"} />
            <KV k="Reference" v={result?.reference ?? "—"} />
            <KV k="PNR" v={result?.pnr ?? "—"} />
            <KV k="Ticket" v={result?.ticketNumber ?? "—"} />
            <KV k="Environment" v={result?.testMode ? "sandbox / test" : "production"} />
          </div>
          <p className="ca-label" style={{ marginTop: "var(--ca-4)" }}>
            Shown verbatim. The interface never upgrades one of these into the word
            &ldquo;confirmed&rdquo; on the provider&rsquo;s behalf.
          </p>
        </Card>

        <Link href="/activity" className="ca-btn ca-btn--navy">
          <Star size={15} style={{ color: "var(--ca-gold-400)" }} /> See everything the agent did
        </Link>
        <Link href="/" className="ca-btn ca-btn--quiet">
          Back to home
        </Link>
      </div>
    </Screen>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--ca-4)" }}>
      <span className="ca-label">{k}</span>
      <span className="ca-num" style={{ fontSize: "var(--ca-t-xs)" }}>
        {v}
      </span>
    </div>
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
        {flight && <span style={{ display: "block", color: "var(--ca-stone-400)" }}>{flight}</span>}
      </span>
    </div>
  );
}
