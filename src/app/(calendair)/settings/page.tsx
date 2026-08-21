"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/calendair/SessionProvider";
import { Screen } from "@/components/calendair/Screen";
import { Card, Medallion, Pill } from "@/components/calendair/ui";
import { ChevronRight, Clock, Lock, Pin, Refresh, Star, Users, Wallet } from "@/components/calendair/icons";
import { money } from "@/components/calendair/format";
import { ORIGIN_BY_IATA } from "@/lib/calendair/destinations";
import { clearProfile } from "@/lib/onboarding/profile-store";

/**
 * Travel taste.
 *
 * These are the values the engine is using right now, whether they came from
 * onboarding or from the prepared demo traveller — and the screen says which. What
 * matters most here is that the traveller can see exactly which of these numbers
 * are hard rules and which are preferences, because that distinction is the whole
 * safety story.
 */
export default function SettingsScreen() {
  const { ready, world, start } = useSession();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  if (!ready || !world) {
    return (
      <Screen back="/">
        <Card pad style={{ color: "var(--ca-stone-500)" }}>Loading…</Card>
      </Screen>
    );
  }

  const t = world.taste;
  const origin = ORIGIN_BY_IATA[t.originAirport];
  const own = world.profileSource === "traveller";

  const resetToPrepared = async () => {
    setResetting(true);
    clearProfile();
    await start();
    router.push("/");
  };

  return (
    <Screen back="/">
      <div className="ca-stack">
        <div>
          <h1 className="ca-display" style={{ fontSize: "var(--ca-t-xl)", margin: 0 }}>
            Travel taste
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--ca-stone-500)", fontSize: "var(--ca-t-sm)" }}>
            What the agent is allowed to assume about you, and what it must never break.
          </p>
        </div>

        {/* Which profile is actually driving the engine. */}
        <Card flat>
          <Link href="/onboarding" className="ca-row">
            <Medallion tone={own ? "sage" : "gold"}>
              <Star size={17} />
            </Medallion>
            <span>
              <span style={{ display: "block", fontWeight: 500 }}>
                {own ? "Your profile" : "Prepared demo profile"}
              </span>
              <span className="ca-label">
                {own
                  ? `${t.travellerName || "You"} · set up in onboarding`
                  : "A deterministic traveller, so a demo never depends on a live setup"}
              </span>
            </span>
            <span className="ca-link">
              {own ? "Redo" : "Set up"} <ChevronRight size={15} />
            </span>
          </Link>
        </Card>

        <Card>
          <div className="ca-row">
            <Medallion>
              <Pin />
            </Medallion>
            <span>
              <span className="ca-serif" style={{ display: "block", fontSize: "var(--ca-t-md)" }}>
                {origin?.city}
              </span>
              <span className="ca-label">
                {origin?.airportName} ({t.originAirport})
              </span>
            </span>
            <Pill tone="outline">Home</Pill>
          </div>
        </Card>

        <Card pad>
          <span className="ca-eyebrow">Hard rules</span>
          <p className="ca-label" style={{ margin: "6px 0 var(--ca-4)" }}>
            Pass/fail. No score, and no model, can overturn one of these.
          </p>
          <Rule
            icon={<Wallet size={16} />}
            label="Maximum spontaneous spend"
            value={`${money(t.maxSpontaneousSpend, t.currency)} per person`}
          />
          <Rule
            icon={<Clock size={16} />}
            label="Minimum useful time there"
            value={`${t.minUsefulHours} hours on the ground`}
          />
          <Rule
            icon={<Clock size={16} />}
            label="Return buffer"
            value={`${Math.round(t.returnBufferMinutes / 60)} hours before the next commitment`}
          />
          <Rule
            icon={<Star size={15} />}
            label="Flight tolerance"
            value={`Up to ${Math.round(t.maxFlightMinutes / 60)}h each way · ${t.maxStops} stop max`}
          />
        </Card>

        <Card pad>
          <span className="ca-eyebrow">Preferences</span>
          <p className="ca-label" style={{ margin: "6px 0 var(--ca-4)" }}>
            These shape the score. They never veto a trip on their own.
          </p>
          <Rule icon={<Star size={15} />} label="Spontaneity" value={capitalise(t.spontaneity)} />
          <Rule
            icon={<Star size={15} />}
            label="Direct flights"
            value={t.directPreferred ? "Preferred" : "No preference"}
          />
          <Rule
            icon={<Clock size={16} />}
            label="Overnight departures"
            value={t.redEyeTolerated ? "Tolerated" : "Avoided"}
          />
          <Rule
            icon={<Star size={15} />}
            label="Interests"
            value={t.interests.length ? t.interests.join(" · ") : "None stated"}
          />
        </Card>

        <Card pad>
          <span className="ca-eyebrow">Dream list</span>
          {t.dreamDestinations.length > 0 ? (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ca-2)", marginTop: "var(--ca-3)" }}>
                {t.dreamDestinations.map((d, i) => (
                  <span
                    key={d}
                    className="ca-pill ca-pill--outline"
                    style={{ opacity: 1 - i * 0.12 }}
                  >
                    <Star size={12} /> {d}
                  </span>
                ))}
              </div>
              <p className="ca-label" style={{ marginTop: "var(--ca-4)" }}>
                Order matters. Destination affinity is one of nine scoring factors, weighted by where a
                place sits on this list.
              </p>
            </>
          ) : (
            <p className="ca-label" style={{ marginTop: "var(--ca-3)" }}>
              Nothing named yet. Affinity then rests on your interests and how far you asked the agent
              to reach.
            </p>
          )}
        </Card>

        <Card pad>
          <span className="ca-eyebrow">Companions</span>
          {world.companions.length > 0 ? (
            <div style={{ marginTop: "var(--ca-3)" }}>
              {world.companions.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0,1fr) auto",
                    gap: "var(--ca-3)",
                    alignItems: "center",
                    padding: "var(--ca-3) 0",
                    borderTop: "1px solid var(--ca-line-soft)",
                  }}
                >
                  <Medallion>
                    <Users size={16} />
                  </Medallion>
                  <span>
                    <span style={{ display: "block", fontWeight: 500 }}>{c.name}</span>
                    <span className="ca-label">{c.relationship}</span>
                  </span>
                  <Pill tone="sage">Free/busy only</Pill>
                </div>
              ))}
            </div>
          ) : (
            <p className="ca-label" style={{ marginTop: "var(--ca-3)" }}>
              Travelling alone. No second calendar is read, and the shared-availability rule has
              nothing to check.
            </p>
          )}
        </Card>

        <Card pad flat>
          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "var(--ca-3)" }}>
            <Lock size={18} style={{ color: "var(--ca-gold-600)" }} />
            <div>
              <span style={{ display: "block", fontWeight: 500, fontSize: "var(--ca-t-sm)" }}>
                Privacy
              </span>
              <p className="ca-label" style={{ marginTop: 4 }}>
                Least-privilege calendar access. Shared matching uses availability only. Payment
                secrets and passenger document data are never placed in a model prompt, and every
                consequential write is recorded in the activity log.
              </p>
            </div>
          </div>
        </Card>

        <p className="ca-label" style={{ textAlign: "center" }}>
          Changing any of this means answering the questions again, so the engine is never running on
          half an answer.
        </p>

        {own && (
          <button
            type="button"
            className="ca-btn ca-btn--quiet"
            onClick={resetToPrepared}
            disabled={resetting}
          >
            <Refresh size={15} /> Forget my profile and use the prepared traveller
          </button>
        )}
      </div>
    </Screen>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Rule({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0,1fr)",
        gap: "var(--ca-3)",
        alignItems: "start",
        padding: "var(--ca-3) 0",
        borderTop: "1px solid var(--ca-line-soft)",
      }}
    >
      <span style={{ color: "var(--ca-gold-600)", marginTop: 1 }}>{icon}</span>
      <span>
        <span className="ca-label" style={{ display: "block" }}>
          {label}
        </span>
        <span style={{ fontSize: "var(--ca-t-sm)" }}>{value}</span>
      </span>
    </div>
  );
}
