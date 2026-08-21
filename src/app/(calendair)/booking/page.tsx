"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/calendair/SessionProvider";
import { Screen } from "@/components/calendair/Screen";
import { Card, Medallion, Pill } from "@/components/calendair/ui";
import {
  ArrowRight,
  Check,
  Lock,
  Plane,
  Refresh,
  Shield,
  ShieldCheck,
  Star,
  TrendUp,
  Users,
  Wallet,
} from "@/components/calendair/icons";
import { duration, localDate, localTime, money, placeName } from "@/components/calendair/format";
import { minutesBetween } from "@/lib/calendair/time";
import type { BookingState } from "@/lib/calendair/types";

/** ~48s of checking at 1.2s per attempt — long enough for every real scenario, bounded so "pending" never spins forever. */
const MAX_POLL_ATTEMPTS = 40;

/**
 * The checkpoints.
 *
 * Everything expensive happens on this screen, so everything on it is explicit:
 * what was rechecked, what changed, exactly what is about to be paid, and the
 * honest pending state while the provider decides whether it worked.
 */
export default function BookingScreen() {
  const router = useRouter();
  const { ready, world, booking, acceptPrice, book, pollFulfilment, authorize, outcome, busy, error } =
    useSession();
  const [polling, setPolling] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const pollRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const inFlightRef = useRef(false);
  const [resumeKey, setResumeKey] = useState(0);

  const state = booking.state;
  const verified = booking.verified;

  const stop = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  // Ticketing is asked about, never assumed. The poll stops the moment the
  // provider gives a state of its own — and it is bounded, because a demo
  // that spins on an interval forever is its own kind of dishonesty. The
  // "pending" rehearsal scenario deliberately never confirms; after
  // MAX_POLL_ATTEMPTS this says so instead of polling silently through the
  // rest of the demo. "Check again" resumes deliberately, on request.
  useEffect(() => {
    if (state !== "BOOKING_PENDING" || pollRef.current) return;
    setPolling(true);
    setPollExhausted(false);
    attemptsRef.current = 0;
    inFlightRef.current = false;
    pollRef.current = window.setInterval(() => {
      // Guard against overlap: with a slow provider, a naive unguarded async
      // callback on a 1.2s interval can pile up dozens of concurrent CLI
      // round-trips. Skip this tick entirely if the previous poll hasn't
      // resolved yet, rather than firing another.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      attemptsRef.current += 1;
      pollFulfilment()
        .then((next) => {
          if (next && next !== "BOOKING_PENDING") {
            stop();
            setPolling(false);
            if (next === "COMPLETE") router.push("/trip");
            return;
          }
          if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
            stop();
            setPolling(false);
            setPollExhausted(true);
          }
        })
        .catch(() => {
          // A rejected poll (e.g. a network-level failure fetch() itself
          // throws on) must not escape as an unhandled promise rejection and
          // must not stop the loop early — "we don't know yet, ask again" is
          // exactly what the next tick is for.
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }, 1200);
    return stop;
  }, [state, pollFulfilment, router, stop, resumeKey]);

  useEffect(() => {
    if (state === "COMPLETE") router.replace("/trip");
  }, [state, router]);

  if (!ready || !world) {
    return (
      <Screen back="/">
        <Card pad style={{ color: "var(--ca-stone-500)" }}>Loading…</Card>
      </Screen>
    );
  }

  if (!verified && state !== "SAFE_STOP" && state !== "SOLD_OUT" && state !== "PROVIDER_UNAVAILABLE") {
    return (
      <Screen back="/">
        <Card pad>
          <span className="ca-eyebrow">Nothing to confirm</span>
          <p className="ca-serif" style={{ fontSize: "var(--ca-t-md)", margin: "8px 0 var(--ca-4)" }}>
            Start from an escape.
          </p>
          <Link href="/" className="ca-btn ca-btn--quiet">
            Back to your escape
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back="/">
      <div className="ca-stack">
        <Progress state={state} />

        {state === "PRICE_CHANGED" && verified && (
          <PriceChanged
            previous={booking.previousTotal ?? verified.totalPrice}
            current={verified.totalPrice}
            currency={verified.currency}
            busy={busy}
            onAccept={async () => {
              await acceptPrice();
            }}
          />
        )}

        {(state === "PRICE_CONFIRMED" || state === "USER_CHECKPOINT") && verified && (
          <PaymentCheckpoint
            total={booking.approvedTotal ?? verified.totalPrice}
            currency={verified.currency}
            passengerName={world.taste.travellerName}
            travellers={world.window.sharedWith.length > 0 ? 2 : 1}
            busy={busy}
            onConfirm={async () => {
              await book();
            }}
          />
        )}

        {(state === "BOOKING_PENDING" || state === "BOOKING_CREATING") && (
          <Card pad data-tour="booking.decision">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
              <Medallion>
                <Star size={18} className="ca-pulse" />
              </Medallion>
              <div>
                <div className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
                  {booking.result?.rawStatusLabel ?? "Booking requested"}
                </div>
                <span className="ca-label">
                  {pollExhausted
                    ? "Stopped checking automatically"
                    : polling
                      ? "Asking the provider what actually happened…"
                      : "Awaiting confirmation"}
                </span>
              </div>
            </div>
            <p className="ca-label" style={{ marginTop: "var(--ca-4)" }}>
              A successful response is not a journey. This will not say confirmed until the provider
              returns its own confirmed state.
            </p>
            {booking.reference && (
              <p className="ca-label ca-num" style={{ marginTop: "var(--ca-2)" }}>
                {/* booking.result.testMode is set by the adapter that actually created this
                    booking — never hardcode "sandbox", or a real ATLAS_ENV=production
                    reference gets mislabelled as a rehearsal. */}
                Reference {booking.reference}{" "}
                <span style={{ opacity: 0.6 }}>
                  · {booking.result?.testMode ?? true ? "sandbox" : "production"}
                </span>
              </p>
            )}
            {pollExhausted && (
              <div
                style={{
                  marginTop: "var(--ca-4)",
                  paddingTop: "var(--ca-4)",
                  borderTop: "1px solid var(--ca-line-soft)",
                }}
              >
                <p className="ca-label">
                  Real fulfilment can take longer than this. Rather than poll indefinitely, the agent
                  stopped after a minute of checking — nothing here has changed, and nothing was lost.
                </p>
                <button
                  type="button"
                  className="ca-btn ca-btn--quiet"
                  style={{ marginTop: "var(--ca-3)" }}
                  onClick={() => setResumeKey((k) => k + 1)}
                >
                  <Refresh size={15} /> Check again
                </button>
              </div>
            )}
          </Card>
        )}

        {state === "SOLD_OUT" && outcome?.kind === "unavailable" && outcome.replacement && (
          <Replacement
            trip={outcome.replacement}
            replans={booking.replans}
            busy={busy}
            onTake={async () => {
              await authorize(outcome.replacement!.id);
            }}
          />
        )}

        {state === "PROVIDER_UNAVAILABLE" && (
          <Card pad data-tour="booking.decision">
            <span className="ca-eyebrow">Provider unavailable</span>
            <p className="ca-serif" style={{ fontSize: "var(--ca-t-lg)", margin: "8px 0" }}>
              We couldn&apos;t reach the flight provider to recheck this fare.
            </p>
            <p style={{ color: "var(--ca-stone-500)", fontSize: "var(--ca-t-sm)" }}>
              {error ??
                "This is not a statement about whether the fare is still available — Atlas didn't answer, even after retrying, so nothing was ruled out. Nothing was booked and your calendar is untouched."}
            </p>
            <Link href="/" className="ca-btn ca-btn--quiet" style={{ marginTop: "var(--ca-5)" }}>
              Back to your escape
            </Link>
          </Card>
        )}

        {state === "BOOKING_OUTCOME_UNKNOWN" && (
          <Card pad data-tour="booking.decision">
            <span className="ca-eyebrow">Outcome unknown</span>
            <p className="ca-serif" style={{ fontSize: "var(--ca-t-lg)", margin: "8px 0" }}>
              We could not confirm whether this booking went through.
            </p>
            <p style={{ color: "var(--ca-stone-500)", fontSize: "var(--ca-t-sm)" }}>
              {error ??
                "The booking request could not be completed, but the provider never told us it was rejected either — it may have gone through. Please check with the provider before retrying, so this cannot be booked twice."}
            </p>
            <Link href="/" className="ca-btn ca-btn--quiet" style={{ marginTop: "var(--ca-5)" }}>
              Back to your escape
            </Link>
          </Card>
        )}

        {((state === "SAFE_STOP" || state === "BOOKING_FAILED") ||
          (state === "SOLD_OUT" && outcome?.kind !== "unavailable")) && (
          <Card pad data-tour="booking.decision">
            <span className="ca-eyebrow">Stopped safely</span>
            <p className="ca-serif" style={{ fontSize: "var(--ca-t-lg)", margin: "8px 0" }}>
              {state === "SOLD_OUT" ? "That fare is gone." : "Nothing was booked."}
            </p>
            <p style={{ color: "var(--ca-stone-500)", fontSize: "var(--ca-t-sm)" }}>
              {error ??
                "The agent replanned within its limit and then stopped rather than improvising. Your calendar is untouched and the window stays open."}
            </p>
            <Link href="/" className="ca-btn ca-btn--quiet" style={{ marginTop: "var(--ca-5)" }}>
              Find another escape
            </Link>
          </Card>
        )}

        {verified && (
          <Card pad>
            <span className="ca-eyebrow">Your itinerary</span>
            <div style={{ marginTop: "var(--ca-3)" }}>
              <Row
                iso={verified.outboundDepartureIso}
                code={verified.origin}
                meta={`Duration ${duration(
                  minutesBetween(verified.outboundDepartureIso, verified.outboundArrivalIso),
                )}`}
                linked
              />
              <Row iso={verified.outboundArrivalIso} code={verified.destination} />
              <div style={{ borderTop: "1px dashed var(--ca-line)", margin: "var(--ca-3) 0" }} />
              <Row
                iso={verified.returnDepartureIso!}
                code={verified.destination}
                meta={`Duration ${duration(
                  minutesBetween(verified.returnDepartureIso!, verified.returnArrivalIso!),
                )}`}
                linked
              />
              <Row iso={verified.returnArrivalIso!} code={verified.origin} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--ca-4)",
                marginTop: "var(--ca-4)",
                paddingTop: "var(--ca-4)",
                borderTop: "1px solid var(--ca-line-soft)",
              }}
            >
              <span className="ca-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Users size={15} style={{ color: "var(--ca-gold-600)" }} />
                {world.window.sharedWith.length > 0 ? "2 travellers" : "1 traveller"}
              </span>
              <span className="ca-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Lock size={14} style={{ color: "var(--ca-gold-600)" }} />
                Test environment · no payment taken
              </span>
            </div>
          </Card>
        )}
      </div>
    </Screen>
  );
}

const STEPS: { state: BookingState[]; title: string; detail: string }[] = [
  {
    state: ["USER_AUTHORIZED", "REVERIFYING"],
    title: "Rechecking your constraints",
    detail: "Window, budget, buffer and companion re-evaluated",
  },
  {
    state: ["REVERIFYING"],
    title: "Re-reading the live fare",
    detail: "Price and availability read fresh from the provider",
  },
  {
    state: ["PRICE_CHANGED", "PRICE_CONFIRMED"],
    title: "Confirming the exact total",
    detail: "Any difference needs your explicit acceptance",
  },
  {
    state: ["BOOKING_CREATING", "BOOKING_PENDING"],
    title: "Creating the booking",
    detail: "The first write, against the total you approved",
  },
  {
    state: ["FULFILMENT_CONFIRMED", "CALENDAR_UPDATED", "COMPLETE"],
    title: "Asserting the outcome",
    detail: "Confirmed only when the provider says so",
  },
  {
    state: ["CALENDAR_UPDATED", "COMPLETE"],
    title: "Generating your calendar blocks",
    detail: "Flights, the days away and a recovery buffer — held in this session, not an external calendar",
  },
];

const ORDER: BookingState[] = [
  "USER_AUTHORIZED",
  "REVERIFYING",
  "PRICE_CHANGED",
  "PRICE_CONFIRMED",
  "BOOKING_CREATING",
  "BOOKING_PENDING",
  "FULFILMENT_CONFIRMED",
  "CALENDAR_UPDATED",
  "COMPLETE",
];

function Progress({ state }: { state: BookingState }) {
  const at = ORDER.indexOf(state);
  return (
    <Card pad data-tour="booking.steps">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span className="ca-eyebrow">Checkpoints</span>
        <Pill
          tone={
            state === "SAFE_STOP" || state === "PROVIDER_UNAVAILABLE" || state === "BOOKING_OUTCOME_UNKNOWN"
              ? "rose"
              : "outline"
          }
        >
          {state.replace(/_/g, " ").toLowerCase()}
        </Pill>
      </div>
      <div className="ca-steps" style={{ marginTop: "var(--ca-2)" }}>
        {STEPS.map((s) => {
          const first = ORDER.indexOf(s.state[0]);
          const last = ORDER.indexOf(s.state[s.state.length - 1]);
          const active = at >= first && at <= last;
          const done = at > last;
          return (
            <div
              key={s.title}
              className={`ca-step${done ? " is-done" : active ? " is-active" : " is-pending"}`}
            >
              <span className="ca-step__node">
                {done ? <Check size={13} /> : active ? <Star size={11} className="ca-pulse" /> : null}
              </span>
              <span>
                <span className="ca-step__title">{s.title}</span>
                <span className="ca-step__detail" style={{ display: "block" }}>
                  {s.detail}
                </span>
              </span>
              <span className="ca-step__meta">{done ? "done" : active ? "now" : ""}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * FR-009 — a replacement is a different trip, so it is a different decision.
 *
 * The agent found it inside the same hard constraints, and then stopped. It has
 * no authority to swap Dubai for Tokyo on somebody's behalf.
 */
function Replacement({
  trip,
  replans,
  busy,
  onTake,
}: {
  trip: NonNullable<Extract<ReturnType<typeof useSession>["outcome"], { kind: "unavailable" }>["replacement"]>;
  replans: number;
  busy: boolean;
  onTake: () => void;
}) {
  return (
    <Card pad className="ca-rise" data-tour="booking.decision">
      <span className="ca-eyebrow">That fare has gone</span>
      <p className="ca-serif" style={{ fontSize: "var(--ca-t-lg)", margin: "8px 0 4px" }}>
        {trip.destinationName} still clears every rule.
      </p>
      <p style={{ margin: 0, color: "var(--ca-stone-500)", fontSize: "var(--ca-t-sm)" }}>
        The agent re-evaluated inside your original constraints and then stopped. Replan{" "}
        {replans} of {MAX_REPLANS_UI}.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          alignItems: "center",
          gap: "var(--ca-4)",
          margin: "var(--ca-5) 0",
          padding: "var(--ca-4)",
          background: "var(--ca-ivory-200)",
          borderRadius: "var(--ca-r-sm)",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span className="ca-serif" style={{ display: "block", fontSize: "var(--ca-t-md)" }}>
            {trip.destinationName}
          </span>
          <span className="ca-label">
            {money(trip.totalPrice, trip.currency)} · {trip.stops === 0 ? "non-stop" : `${trip.stops} stop`} ·
            score {trip.escapeScore}
          </span>
        </span>
        <ArrowRight size={18} style={{ color: "var(--ca-gold-600)" }} />
      </div>

      <div style={{ display: "grid", gap: "var(--ca-3)" }}>
        <button type="button" className="ca-btn ca-btn--navy" onClick={onTake} disabled={busy}>
          <Star size={15} style={{ color: "var(--ca-gold-400)" }} /> Check {trip.destinationName} instead
        </button>
        <Link href="/" className="ca-btn ca-btn--outline">
          Find another
        </Link>
      </div>
    </Card>
  );
}

const MAX_REPLANS_UI = 2;

function PriceChanged({
  previous,
  current,
  currency,
  busy,
  onAccept,
}: {
  previous: number;
  current: number;
  currency: string;
  busy: boolean;
  onAccept: () => void;
}) {
  const delta = current - previous;
  const pct = ((delta / previous) * 100).toFixed(1);
  return (
    <Card pad className="ca-rise" data-tour="booking.decision">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
        <Medallion size="lg">
          <TrendUp size={22} />
        </Medallion>
        <div>
          <div className="ca-display" style={{ fontSize: "var(--ca-t-xl)" }}>
            Price changed
          </div>
          <p style={{ margin: "4px 0 0", color: "var(--ca-stone-500)", fontSize: "var(--ca-t-sm)" }}>
            During live fare reverification the price increased. No action has been taken yet.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
          alignItems: "center",
          gap: "var(--ca-3)",
          margin: "var(--ca-6) 0 var(--ca-4)",
        }}
      >
        <div>
          <span className="ca-label">Previous price</span>
          <div className="ca-serif ca-num" style={{ fontSize: "var(--ca-t-lg)" }}>
            {currency} {money(previous, "").slice(0)}
          </div>
        </div>
        <ArrowRight size={18} style={{ color: "var(--ca-gold-600)" }} />
        <div>
          <span className="ca-label" style={{ color: "var(--ca-gold-700)" }}>
            New price
          </span>
          <div className="ca-serif ca-num" style={{ fontSize: "var(--ca-t-lg)" }}>
            {currency} {money(current, "").slice(0)}
          </div>
          <span className="ca-num" style={{ fontSize: "var(--ca-t-xs)", color: "var(--ca-gold-700)" }}>
            + {currency} {Math.abs(delta).toLocaleString("en-US")} (↑ {pct}%)
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto minmax(0,1fr)",
          gap: "var(--ca-3)",
          padding: "var(--ca-4)",
          background: "var(--ca-ivory-200)",
          borderRadius: "var(--ca-r-sm)",
        }}
      >
        <Shield size={18} style={{ color: "var(--ca-gold-600)" }} />
        <span style={{ fontSize: "var(--ca-t-sm)" }}>
          Your itinerary is still held. Accepting is a separate decision — the agent has no authority
          to absorb the difference on your behalf.
        </span>
      </div>

      <div style={{ display: "grid", gap: "var(--ca-3)", marginTop: "var(--ca-5)" }}>
        <button type="button" className="ca-btn ca-btn--navy" onClick={onAccept} disabled={busy}>
          <Star size={15} style={{ color: "var(--ca-gold-400)" }} /> Accept new price
        </button>
        <Link href="/" className="ca-btn ca-btn--outline">
          Find another
        </Link>
      </div>
    </Card>
  );
}

function PaymentCheckpoint({
  total,
  currency,
  passengerName,
  travellers,
  busy,
  onConfirm,
}: {
  total: number;
  currency: string;
  passengerName: string;
  travellers: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const perPerson = total;
  const fare = Math.round(perPerson * 0.84);
  const taxes = perPerson - fare;
  return (
    <Card pad className="ca-rise" data-tour="booking.decision">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ca-4)" }}>
        <Medallion tone="sage">
          <ShieldCheck size={20} />
        </Medallion>
        <div>
          <div className="ca-serif" style={{ fontSize: "var(--ca-t-md)" }}>
            Live fare verified
          </div>
          <span className="ca-label">This exact total was confirmed moments ago</span>
        </div>
      </div>

      <div style={{ marginTop: "var(--ca-5)" }}>
        <span className="ca-eyebrow">Payment summary</span>
        <div style={{ marginTop: "var(--ca-3)", display: "grid", gap: "var(--ca-2)" }}>
          <Line label={`Fare × ${travellers}`} value={`${currency} ${(fare * travellers).toLocaleString("en-US")}`} />
          <Line label="Taxes and carrier charges" value={`${currency} ${(taxes * travellers).toLocaleString("en-US")}`} />
          <Line label="Optional services" value="None selected" muted />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              paddingTop: "var(--ca-3)",
              marginTop: "var(--ca-2)",
              borderTop: "1px solid var(--ca-line)",
            }}
          >
            <span style={{ fontSize: "var(--ca-t-sm)" }}>Total</span>
            <span className="ca-serif ca-num" style={{ fontSize: "var(--ca-t-lg)" }}>
              {currency} {(total * travellers).toLocaleString("en-US")}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto minmax(0,1fr)",
          gap: "var(--ca-3)",
          marginTop: "var(--ca-5)",
          padding: "var(--ca-4)",
          background: "var(--ca-ivory-200)",
          borderRadius: "var(--ca-r-sm)",
        }}
      >
        <Wallet size={18} style={{ color: "var(--ca-gold-600)" }} />
        <span style={{ fontSize: "var(--ca-t-xs)", color: "var(--ca-stone-600)" }}>
          Passenger: {passengerName} (fictional test profile). This is a test-environment rehearsal —
          no real booking is created and no payment method is charged.
        </span>
      </div>

      <button
        type="button"
        className="ca-btn ca-btn--gold"
        style={{ marginTop: "var(--ca-5)" }}
        onClick={onConfirm}
        disabled={busy}
      >
        <Star size={16} />
        {busy ? "Confirming…" : "Confirm this exact payment"}
      </button>
    </Card>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--ca-4)" }}>
      <span style={{ fontSize: "var(--ca-t-sm)", color: "var(--ca-stone-500)" }}>{label}</span>
      <span
        className="ca-num"
        style={{ fontSize: "var(--ca-t-sm)", color: muted ? "var(--ca-stone-400)" : "var(--ca-ink-700)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Row({
  iso,
  code,
  meta,
  linked,
}: {
  iso: string;
  code: string;
  meta?: string;
  linked?: boolean;
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
      </span>
    </div>
  );
}
