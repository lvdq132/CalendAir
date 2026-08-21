"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSession } from "@/components/calendair/SessionProvider";
import { useOnboarding } from "./OnboardingProvider";
import {
  Assurance,
  ChipRow,
  NumberStepper,
  OptionCard,
  Segmented,
  StepHeading,
  SuggestionRow,
  SwitchRow,
  TasteCard,
  TextField,
} from "./controls";
import { IconArrow } from "./icons";
import { CalendarCheck, Clock, Lock, Pin, Star, Users, Wallet } from "@/components/calendair/icons";
import { money } from "@/components/calendair/format";
import { BOUNDS, BLANK_PROFILE, type TravellerProfile } from "@/lib/calendair/profile";
import { SUPPORTED_CURRENCIES } from "@/lib/calendair/money";
import { DESTINATIONS, ORIGINS, ORIGIN_BY_IATA } from "@/lib/calendair/destinations";
import { TASTE_TAGS, type TasteTag } from "@/lib/calendair/types";
import { clearProfile, saveProfile } from "@/lib/onboarding/profile-store";

/**
 * Onboarding.
 *
 * Eight questions, one per screen, in the order a concierge would actually ask
 * them: when are you free, where do you start from, how adventurous are you, what
 * are your limits, what do you travel for, where have you always meant to go, who
 * with, and how should I reach you.
 *
 * Two things are load-bearing. The hard limits collected in step four become
 * pass/fail rules the engine cannot be talked out of, so they are bounded by the
 * controls themselves. Everything in steps three, five and six only ever moves a
 * score. The screens say which is which, because that distinction is the product.
 */

const TASTE_HINT: Record<TasteTag, string> = {
  Food: "Markets, counters, long dinners",
  Culture: "Galleries, design, architecture",
  Nature: "Air, water, open ground",
  Beach: "Sand and a slow afternoon",
  Adventure: "Something with a story afterwards",
  Wellness: "Sleep, water, quiet",
  Nightlife: "Cities that start after dark",
  History: "Old streets and older stones",
  Family: "Room for everyone",
  Events: "A fixture worth flying for",
};

/** Cities offered as dream-list suggestions. The catalogue, plus a classic. */
const DREAM_SUGGESTIONS = Array.from(
  new Set([...DESTINATIONS.map((d) => d.city), "Paris"]),
).sort();

const STEP_COUNT = 8;

export function Wizard() {
  const router = useRouter();
  const { start } = useSession();
  const { acceptTour } = useOnboarding();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<TravellerProfile>(BLANK_PROFILE);
  const [dreamEntry, setDreamEntry] = useState("");
  const [leaving, setLeaving] = useState(false);

  const set = <K extends keyof TravellerProfile>(key: K, value: TravellerProfile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const origin = ORIGIN_BY_IATA[draft.originAirport];

  // The zone the airport sits in, and the one this browser is actually in. Offered
  // as a choice only when they differ, because a traveller abroad this week still
  // has a home timezone.
  const zones = useMemo(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const list = [origin?.zone].filter(Boolean) as string[];
    if (detected && !list.includes(detected)) list.push(detected);
    return list;
  }, [origin?.zone]);

  const addDream = (value: string) => {
    const clean = value.trim().slice(0, BOUNDS.text.max);
    if (!clean) return;
    if (draft.dreamDestinations.some((d) => d.toLowerCase() === clean.toLowerCase())) return;
    if (draft.dreamDestinations.length >= BOUNDS.dreams.max) return;
    set("dreamDestinations", [...draft.dreamDestinations, clean]);
    setDreamEntry("");
  };

  const toggleTaste = (tag: TasteTag) => {
    const has = draft.interests.includes(tag);
    if (has) {
      set(
        "interests",
        draft.interests.filter((t) => t !== tag),
      );
      return;
    }
    if (draft.interests.length >= BOUNDS.interests.max) return;
    set("interests", [...draft.interests, tag]);
  };

  /** Only the taste step insists on an answer; nothing else can trap anyone. */
  const canAdvance = step !== 4 || draft.interests.length > 0;

  const finish = async () => {
    setLeaving(true);
    saveProfile({
      ...draft,
      // A blank name is a fine answer; the projection fills it rather than nagging.
      homeCity: draft.homeCity || (origin?.city ?? ""),
      timezone: zones.includes(draft.timezone) ? draft.timezone : (zones[0] ?? draft.timezone),
    });
    // Finishing the wizard is an introduction; the coach marks take it from here.
    acceptTour();
    await start();
    router.push("/");
  };

  /** The escape hatch: run on the prepared demo traveller instead. */
  const usePrepared = async () => {
    setLeaving(true);
    clearProfile();
    acceptTour();
    await start();
    router.push("/");
  };

  const steps = [
    // 1 ── Calendar and privacy ───────────────────────────────────────────────
    <div key="calendar" className="ca-stack">
      <StepHeading
        eyebrow="Step 1 of 8"
        title="First, when are you free?"
        body="Calendair works from your availability — not from what is in your diary. It needs to know that Friday afternoon opened up, never why."
      />
      <OptionCard
        selected={draft.calendarProvider === "demo"}
        onSelect={() => set("calendarProvider", "demo")}
        icon={<CalendarCheck size={18} />}
        title="Use the prepared calendar"
        detail="A deterministic fictional week, ready to run."
        note="What the judged demo uses. Nothing to connect."
      />
      <OptionCard
        selected={draft.calendarProvider === "google"}
        onSelect={() => set("calendarProvider", "google")}
        icon={<Star size={17} />}
        title="Google Calendar"
        detail="Free/busy access only, at the narrowest scope Google offers."
        note="Not connected in this build: it needs a one-time authorisation from the account owner. Until then availability comes from the prepared calendar, and every screen says so."
      />
      <Assurance>
        <Lock size={13} /> Event titles are never requested, stored, shown or sent to a model. A
        companion&rsquo;s calendar is only ever read as busy or free.
      </Assurance>
    </div>,

    // 2 ── Home ───────────────────────────────────────────────────────────────
    <div key="home" className="ca-stack">
      <StepHeading
        eyebrow="Step 2 of 8"
        title="Where do you fly from?"
        body="Your home airport anchors every search, and its timezone anchors every calculation."
      />
      <TextField
        label="Your name"
        hint="Optional"
        value={draft.travellerName}
        onChange={(v) => set("travellerName", v)}
        placeholder="Adrien"
      />
      <div className="es-wiz__field">
        <div className="es-wiz__field-head">
          <span className="es-wiz__field-label">Home airport</span>
          <span className="es-wiz__field-hint">More arrive with live inventory</span>
        </div>
        <div className="ca-stack" style={{ gap: "var(--ca-2)" }}>
          {ORIGINS.map((o) => (
            <OptionCard
              key={o.iata}
              selected={draft.originAirport === o.iata}
              onSelect={() => {
                set("originAirport", o.iata);
                set("homeCity", o.city);
                set("timezone", o.zone);
              }}
              icon={<Pin size={17} />}
              title={`${o.city} — ${o.airportName}`}
              detail={`${o.iata} · ${o.zone}`}
            />
          ))}
        </div>
      </div>
      {zones.length > 1 && (
        <Segmented
          label="Your timezone"
          hint="Used for every time calculation"
          value={zones.includes(draft.timezone) ? draft.timezone : zones[0]}
          options={zones.map((z) => ({ value: z, label: z.split("/").pop() ?? z }))}
          onChange={(v) => set("timezone", v)}
        />
      )}
    </div>,

    // 3 ── Spontaneity ────────────────────────────────────────────────────────
    <div key="spontaneity" className="ca-stack">
      <StepHeading
        eyebrow="Step 3 of 8"
        title="How far should I reach?"
        body="This changes how much an unfamiliar destination is worth when scores are compared. It is the only thing it changes."
      />
      <OptionCard
        selected={draft.spontaneity === "safe"}
        onSelect={() => set("spontaneity", "safe")}
        title="Safe"
        detail="Stay close to places I already want to go."
      />
      <OptionCard
        selected={draft.spontaneity === "curious"}
        onSelect={() => set("spontaneity", "curious")}
        title="Curious"
        detail="Surprise me, within reason."
        note="Recommended"
      />
      <OptionCard
        selected={draft.spontaneity === "wild"}
        onSelect={() => set("spontaneity", "wild")}
        title="Wild"
        detail="Somewhere I would never have thought to look."
      />
      <Assurance>
        <Lock size={13} /> This can never move your budget, your timings, your return buffer, or the
        approval you give before anything is booked.
      </Assurance>
    </div>,

    // 4 ── Hard preferences ───────────────────────────────────────────────────
    <div key="limits" className="ca-stack">
      <StepHeading
        eyebrow="Step 4 of 8"
        title="Now your limits."
        body="These are pass/fail. An itinerary that breaks one of them cannot win, whatever else it has going for it."
      />
      <Segmented
        label="Currency"
        value={draft.currency}
        options={SUPPORTED_CURRENCIES.slice(0, 5).map((c) => ({ value: c, label: c }))}
        onChange={(v) => set("currency", v)}
      />
      <NumberStepper
        label="Most I would spend on a whim"
        hint="Per person, return"
        value={draft.maxSpontaneousSpend}
        onChange={(v) => set("maxSpontaneousSpend", v)}
        min={BOUNDS.spend.min}
        max={BOUNDS.spend.max}
        step={250}
        format={(v) => money(v, draft.currency)}
      />
      <NumberStepper
        label="Longest flight I will take"
        hint="Each way"
        value={draft.maxFlightMinutes}
        onChange={(v) => set("maxFlightMinutes", v)}
        min={BOUNDS.flightMinutes.min}
        max={BOUNDS.flightMinutes.max}
        step={60}
        format={(v) => `${Math.round(v / 60)} hours`}
      />
      <NumberStepper
        label="Least useful time there"
        hint="Real hours on the ground"
        value={draft.minUsefulHours}
        onChange={(v) => set("minUsefulHours", v)}
        min={BOUNDS.usefulHours.min}
        max={BOUNDS.usefulHours.max}
        step={4}
        format={(v) => `${v} hours`}
      />
      <NumberStepper
        label="Breathing room when I land"
        hint="Before the next commitment"
        value={draft.returnBufferMinutes}
        onChange={(v) => set("returnBufferMinutes", v)}
        min={BOUNDS.bufferMinutes.min}
        max={BOUNDS.bufferMinutes.max}
        step={60}
        format={(v) => `${Math.round(v / 60)} hours`}
      />
      <NumberStepper
        label="Connections I will accept"
        value={draft.maxStops}
        onChange={(v) => set("maxStops", v)}
        min={BOUNDS.stops.min}
        max={BOUNDS.stops.max}
        step={1}
        format={(v) => (v === 0 ? "Non-stop only" : v === 1 ? "One stop" : `${v} stops`)}
      />
      <SwitchRow
        label="Prefer non-stop"
        hint="A preference, not a rule"
        checked={draft.directPreferred}
        onChange={(v) => set("directPreferred", v)}
      />
      <SwitchRow
        label="Overnight departures are fine"
        hint="Leaving between 23:00 and 05:00"
        checked={draft.redEyeTolerated}
        onChange={(v) => set("redEyeTolerated", v)}
      />
    </div>,

    // 5 ── Taste ──────────────────────────────────────────────────────────────
    <div key="taste" className="ca-stack">
      <StepHeading
        eyebrow="Step 5 of 8"
        title="What do you travel for?"
        body={`Choose up to ${BOUNDS.interests.max}. These are counted against what a destination is actually good for, and they move the score — never a rule.`}
      />
      <div className="es-wiz__tastes">
        {TASTE_TAGS.map((tag) => (
          <TasteCard
            key={tag}
            label={tag}
            hint={TASTE_HINT[tag]}
            selected={draft.interests.includes(tag)}
            onToggle={() => toggleTaste(tag)}
            disabled={draft.interests.length >= BOUNDS.interests.max}
          />
        ))}
      </div>
      <p className="es-wiz__count">
        {draft.interests.length === 0
          ? "Pick at least one."
          : `${draft.interests.length} of ${BOUNDS.interests.max} chosen`}
      </p>
    </div>,

    // 6 ── Dream list ─────────────────────────────────────────────────────────
    <div key="dreams" className="ca-stack">
      <StepHeading
        eyebrow="Step 6 of 8"
        title="Anywhere you have always meant to go?"
        body="Order matters — the first one counts for the most. You can skip this entirely."
      />
      <ChipRow
        values={draft.dreamDestinations}
        onRemove={(v) =>
          set(
            "dreamDestinations",
            draft.dreamDestinations.filter((d) => d !== v),
          )
        }
      />
      <div className="es-wiz__addrow">
        <TextField
          label="Add a place"
          value={dreamEntry}
          onChange={setDreamEntry}
          placeholder="Lisbon"
          inputMode="search"
        />
        <button
          type="button"
          className="ca-btn ca-btn--quiet es-wiz__add"
          onClick={() => addDream(dreamEntry)}
          disabled={!dreamEntry.trim() || draft.dreamDestinations.length >= BOUNDS.dreams.max}
        >
          Add
        </button>
      </div>
      <SuggestionRow
        values={DREAM_SUGGESTIONS.filter(
          (s) => !draft.dreamDestinations.some((d) => d.toLowerCase() === s.toLowerCase()),
        )}
        onAdd={addDream}
        disabled={draft.dreamDestinations.length >= BOUNDS.dreams.max}
      />
    </div>,

    // 7 ── Companion ──────────────────────────────────────────────────────────
    <div key="companion" className="ca-stack">
      <StepHeading
        eyebrow="Step 7 of 8"
        title="Anyone coming with you?"
        body="A window only counts as shared when both calendars are genuinely free for all of it."
      />
      <TextField
        label="Their first name"
        hint="Optional"
        value={draft.companionName ?? ""}
        onChange={(v) => set("companionName", v.trim() ? v : null)}
        placeholder="Sophie"
      />
      <OptionCard
        selected={draft.companionName === null}
        onSelect={() => set("companionName", null)}
        icon={<Users size={17} />}
        title="Just me"
        detail="Search for one seat and skip the overlap check."
      />
      <Assurance>
        <Lock size={13} /> Matching uses availability alone. Their event titles are never requested,
        and a name is only ever a label on your own screen.
      </Assurance>
    </div>,

    // 8 ── Notifications ──────────────────────────────────────────────────────
    <div key="notifications" className="ca-stack">
      <StepHeading
        eyebrow="Step 8 of 8"
        title="How often should I speak up?"
        body="An opening is only worth telling you about if you want to hear it."
      />
      <OptionCard
        selected={draft.notifications === "quiet"}
        onSelect={() => set("notifications", "quiet")}
        icon={<Clock size={17} />}
        title="Quiet"
        detail="Only an exceptional window."
      />
      <OptionCard
        selected={draft.notifications === "balanced"}
        onSelect={() => set("notifications", "balanced")}
        icon={<Star size={16} />}
        title="Balanced"
        detail="A strong opening, when there is one."
        note="Recommended"
      />
      <OptionCard
        selected={draft.notifications === "spontaneous"}
        onSelect={() => set("notifications", "spontaneous")}
        icon={<Wallet size={17} />}
        title="Spontaneous"
        detail="Anything worth considering."
      />
      <Assurance>
        <Lock size={13} /> However often I speak up, nothing is verified, priced or booked until you
        say so.
      </Assurance>
    </div>,
  ];

  return (
    <div className="es-wiz">
      <div className="es-wiz__progress" aria-hidden>
        {Array.from({ length: STEP_COUNT }, (_, n) => (
          <span
            key={n}
            className={`es-wiz__pip${n === step ? " is-active" : ""}${n < step ? " is-done" : ""}`}
          />
        ))}
      </div>

      <div key={step} className="ca-rise">
        {steps[step]}
      </div>

      <div className="es-wiz__foot">
        {step > 0 ? (
          <button
            type="button"
            className="ca-btn ca-btn--quiet es-wiz__back"
            onClick={() => setStep((n) => n - 1)}
            disabled={leaving}
          >
            Back
          </button>
        ) : (
          <span />
        )}

        {step < STEP_COUNT - 1 ? (
          <button
            type="button"
            className="ca-btn ca-btn--navy"
            onClick={() => setStep((n) => n + 1)}
            disabled={!canAdvance || leaving}
          >
            Continue
            <IconArrow />
          </button>
        ) : (
          <button
            type="button"
            className="ca-btn ca-btn--gold"
            onClick={finish}
            disabled={leaving}
          >
            <Star size={16} />
            Start exploring
          </button>
        )}
      </div>

      <button type="button" className="es-wiz__prepared" onClick={usePrepared} disabled={leaving}>
        Skip this — run on the prepared demo traveller
      </button>
    </div>
  );
}
