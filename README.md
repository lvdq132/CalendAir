# CALENDAIR

### Your time, perfected.

**CALENDAIR is the in-calendar travel butler that turns unexpected free time into a safely bookable escape.**

Traditional travel starts with a search. CALENDAIR starts with life.

> Life → Opening → Match → Live search → Best escape → Human approval → Reverify → Book → Confirm → Calendar updated

Built for the **Alibaba Cloud × Atlas Agentic AI Hackathon**.

---

> ## ⚠ Atlas cannot run in any deployed runtime — this must run locally to show live search
>
> This is established, not speculated: the Atlas integration is a **local CLI subprocess**
> (`atlas-flight`), not an HTTP API. Its auth credential lives in **this host's OS keyring**
> (macOS Keychain, via Python `keyring` — see `atlas_cli/secure_store.py` in the installed tool) —
> there is no file to mount, no API key, no client secret, and no headless auth mode. Getting
> authorized is an **interactive browser flow** (`atlas-flight auth login`) that has to happen on
> the exact machine that will later run searches. And the official Skill contract is explicit:
> *"Operate through the Atlas Flight Booking CLI only… do not call services directly"* — there is no
> sanctioned HTTP transport to build instead, even in principle.
>
> **Consequence:** live Atlas search (`ATLAS_INTEGRATION_MODE=skill` or `hybrid`) only ever works on
> a machine where a human has run `atlas-flight auth login` once, interactively, in a real browser.
> It cannot work on Vercel, a container, a serverless function, or any other stateless/ephemeral
> deployed target — there is no credential to give it and no way to complete the login flow
> non-interactively. `ATLAS_INTEGRATION_MODE` unset (deterministic demo data) is not a stylistic
> choice for those environments; it is the *only* mode that can run there at all.
>
> `/api/health`'s `atlas.host` block reports the truth about the machine it is actually running on
> — whether the CLI is present, its version, and whether it is authorized **on that host, right
> now** — independent of which mode is configured, so a deployed instance can never appear
> configured when it isn't. See "Live Atlas search, measured" below and `checkAtlasCliOnHost()` in
> `src/lib/atlas/skill-adapter.ts`.

---

## The idea in one screen

A Friday commitment is released. The gap it leaves runs to Monday morning — 68 hours. Nobody
searched for anything. CALENDAIR reads that opening from free/busy state alone, checks whether the
person you travel with is free too, turns it into a real flight search, drops everything that fails
a hard rule, and comes back with **one** escape.

Then it stops, because:

> **The agent can be spontaneous. The transaction cannot.**

## Quick start

```bash
cp .env.example .env.local
npm install
npm run validate
npm run demo
```

Open [http://localhost:3000](http://localhost:3000). `npm run demo` prints the URL and the provider
mode it is actually running against before the server starts.

| Command | What it does |
|---|---|
| `npm run demo` | Start with the recommended `hybrid` demo scenario |
| `npm run demo:visual` | Deterministic everything, for UI rehearsal only |
| `npm run validate` | Typecheck, lint and unit tests |
| `npm run test` | Unit tests, including the acceptance criteria — 107 passing |
| `npm run test:e2e` | Drives the whole agent loop over the real HTTP API, in all four scenarios — 31 checks |
| `npm run build` | Production build |

`npm run demo` sets `DEMO_MODE=hybrid`, which is a **display label for the calendar side only** —
it does not touch Atlas. Whether flight search is live or deterministic is a separate switch,
`ATLAS_INTEGRATION_MODE`, read straight from `.env.local` (see **Live Atlas search, on purpose** below).
The two happen to share the word "hybrid" and mean different things; `/demo` prints both, labelled,
so this is never ambiguous on screen.

## The demo path

1. **Home** — 68 hours opened, both calendars free, one escape: Dubai, Escape Score 91.
2. **Agent activity** — every step timed and attributed, and five candidates rejected with the rule
   that stopped each one.
3. **The escape** — price, useful time, return buffer, and the score opened into its nine factors.
4. **Book escape** — this authorises a fresh read, not a booking.
5. **Checkpoints** — reverification; a price change or a sold-out fare stops for an explicit decision.
6. **Confirmed** — Sandbox result shown verbatim, then the calendar is written.

Switch scenario at `/demo`: `perfect`, `price-change`, `sold-out`, `pending`.

## Screens

| Route | What it is for |
|---|---|
| `/` | The opening, the week it sits in, and the recommended escape |
| `/onboarding` | Eight questions that become the rules the engine runs on |
| `/calendar` | The window, companion overlap, and the commitments on either side |
| `/opportunity/[id]` | The itinerary in full, with the score broken down |
| `/booking` | Reverification, price change, payment checkpoint, pending state |
| `/trip` | What was actually booked, and the calendar write-back |
| `/activity` | The agent log and every rejected candidate |
| `/settings` | Hard rules versus preferences, dream list, privacy |
| `/demo` | Provider mode, scenario switch, onboarding controls |

## Safety properties

These are the product, not a disclaimer. Each one is covered by a test.

| Property | Where it lives |
|---|---|
| Hard constraints are pass/fail and no score can overturn one | `src/lib/calendair/constraints.ts` |
| A reference-only fare can never reach a booking state | `constraints.ts`, `demo-adapter.ts` |
| The live fare is re-read immediately before every write | `src/lib/calendair/flow.ts` |
| A price change stops the flow and needs explicit acceptance | `flow.ts`, `/booking` |
| Replanning is bounded to two attempts, then a safe stop | `flow.ts` |
| A replacement trip is a new human decision, never a substitution | `flow.ts`, `/booking` |
| An HTTP success is not a journey — fulfilment is asserted | `flow.ts`, `/trip` |
| The calendar is written only after confirmation | `flow.ts` |
| Companion matching uses availability only | `src/lib/calendair/engine.ts` |
| A stated preference cannot widen a hard rule | `src/lib/calendair/profile.ts` |
| A budget is only compared once both sides are in the same currency | `src/lib/calendair/money.ts` |
| No titles, tokens or document numbers reach the activity log | `store.ts`, `/activity` |
| A provider outage (`PROVIDER_UNAVAILABLE`) is never reported as "no flights" (`SAFE_STOP`) | `flow.ts`, `skill-adapter.ts`, `/` |
| `order create` is never retried — a duplicate booking is worse than one honest failure | `skill-adapter.ts` |
| A `createBooking`/`getBookingStatus` throw is a reported state, never an unhandled 500 | `flow.ts` |
| The client stops polling fulfilment after a bound instead of spinning forever | `/booking` |

## Architecture

```
Calendar (free/busy)
        │
        ▼
Opportunity Engine ──► hard constraints ──► Escape Score ──► one recommendation
        │                                                          │
        ▼                                                          ▼
   Atlas adapter  ◄──────── reverify ◄──────── human checkpoint ───┘
        │                                                          │
        ▼                                                          ▼
   booking created ──► fulfilment asserted ──► calendar written ──► complete
```

- **`src/lib/calendair/`** — types, deterministic time arithmetic, constraints, scoring, the
  opportunity engine, the booking state machine, and the demo world.
- **`src/lib/atlas/`** — the provider boundary. One interface, four adapters: deterministic demo,
  live skill (real `atlas-flight` CLI), hybrid (live search, demo ticketing), and an unwired
  placeholder for `atrip` that refuses rather than pretends.
- **`src/components/calendair/`** — the interface, rebuilt from the brand system rather than copied
  from the design PNGs.
- **`src/components/onboarding/`** — the profile wizard at `/onboarding`, the first-run introduction,
  in-place coach marks, and the guide.

### Deterministic by design

Timezone arithmetic, budget limits, price comparison, hard-constraint decisions, booking state and
fulfilment are ordinary code with tests. A language model is useful for interpreting a stated
preference or phrasing an explanation, and is kept away from anywhere it could invent a number that
becomes a promise.

### The Atlas boundary

`AtlasAdapter` is the whole travel provider behind one interface:

```ts
getStatus() · searchFlights() · verifyOffer() · createBooking() · getBookingStatus()
```

`ATLAS_INTEGRATION_MODE` picks the adapter, and every screen says which one is running — the badge
on the home screen, `/demo`, and `/api/health`:

| Mode | Search | Verify / book / status | Honest status right now |
|---|---|---|---|
| *(unset, the default)* | Deterministic demo | Deterministic demo | Nothing is live. This is what the judged demo runs on. |
| `skill` | **Live** `atlas-flight` CLI | Live CLI | Search works. Ticketing is blocked for this account (`TICKETING_ACTIVATION_REQUIRED`), so `verifyOffer` and everything after it fails until activation completes at atriptech.com. |
| `hybrid` | **Live** CLI | **Unreachable dead end today**, not "deterministic demo" | Real inventory for search. `verifyOffer` delegates to the demo adapter, but a live-search offer id (e.g. `atl-lon-bcn-…`) never matches the demo adapter's fixed inventory (ids like `atl-dxb-nonstop`), so it always throws → the flow always safe-stops with an explicit `TICKETING_ACTIVATION_REQUIRED` message → `PRICE_CONFIRMED` is never reached → `createBooking` / `getBookingStatus` are unreachable dead code in this mode. Never falls back to demo search on a live failure — see below. |
| `atrip` | — | — | Placeholder. Fails loudly; nothing is implemented. |

`hybrid` is honest about *why* it stops (see `HybridAtlasAdapter.verifyOffer`'s file-header comment for the
full reasoning), but it does not currently make the booking checkpoints past search demonstrable — there is
no synthesized "demo verification" of a live offer, on purpose: fabricating a verified price/availability
from a live search result, even labelled "demo", is exactly the kind of unchecked-number-presented-as-checked
failure this product exists to prevent. If the booking checkpoints need to be demonstrable against real
search results before ticketing activation completes, that requires a deliberate, explicitly-labelled
synthetic-verification path — not implemented here.

Two things worth being precise about, because they are exactly the kind of distinction a stage demo
is tempted to blur:

- **`PROVIDER_UNAVAILABLE` is not `SAFE_STOP`.** A transient Atlas outage ("we couldn't reach the
  provider") and a genuine empty market ("we looked, and nothing qualifies") are different facts.
  `searchFlights` retries up to 3 times with backoff before giving up, and only then throws
  `AtlasProviderUnavailableError` — which the UI renders as *"We couldn't reach the flight
  provider… this is not a statement about availability"*, never as "no flights."
- **`order create` is the one call that is never retried.** Every other Atlas call is safe to retry —
  `getStatus` and `getBookingStatus` genuinely are read-only; `searchFlights` is too. `verifyOffer`
  is *not* read-only (it mints a `booking_id` and traveler records that `createBooking` later
  depends on — see `verifyCache` in `skill-adapter.ts`), but it is still idempotent to call again,
  which is what makes retrying it safe. Booking itself is not idempotent — retrying `order create`
  on a transient failure risks a duplicate order, which this product must never do by accident. A
  `createBooking` failure that the provider actually answered is surfaced once, as a reported
  `BOOKING_FAILED` state the traveller can see; a `createBooking` call that timed out with no
  parseable answer at all is a different, genuinely unknown outcome (`BOOKING_OUTCOME_UNKNOWN`) —
  never a silent retry loop and never an unhandled crash either way.

The flight-layer guide inside the app (`?` → *The flight layer*) covers authorisation, the Sandbox
rehearsal, reference-versus-bookable offers, and why a Sandbox ticket is a test result.

### Seeing live Atlas search versus the deterministic demo

The judged run is deterministic on purpose — reliable on stage beats impressive-but-flaky. To show
real inventory instead, set `ATLAS_INTEGRATION_MODE=hybrid` in `.env.local` (requires
`atlas-flight auth login` once on the host) and restart. The mode badge and `/demo` will say
`Atlas Hybrid · live search, demo ticketing`, and the home screen's searching card says "Searching
live inventory" instead of "Searching the prepared inventory" — the copy always matches the adapter
actually running.

#### Live Atlas search, measured

An earlier version of this document claimed live search "has been observed to fail roughly one
call in three." That number came from a 3-call sample and did not hold up: a later 12-call
sequential run returned 12/12 success. Here is what was actually measured, with sample sizes, so
this doesn't rot into folklore again:

| What was run | Result |
|---|---|
| 12 sequential single-destination search calls | 12/12 succeeded |
| 9-destination catalogue scan, sequential (one call at a time) | 7/9 succeeded; 2 destinations returned the provider's own `SERVICE_TEMPORARILY_UNAVAILABLE` — a genuine, occasional transient error this app's existing retry policy already covers |
| The same 9-destination scan, fully parallel (`Promise.all`, the code as it shipped before this fix) | 5/9 failed with `SECURE_STORE_UNAVAILABLE`, in two separate full runs |

That third row was the real bug, and it was ours, not Atlas's: `atlas-flight` stores its auth token
in the OS keychain, and launching all 9 searches as concurrent child processes made them contend on
that keychain read. Fanning the scan out with an unbounded `Promise.all` was misdiagnosed as
"live search is flaky" when it was actually "this app was asking the CLI to do something it can't do
concurrently." `searchFlights` in `skill-adapter.ts` now bounds that fan-out to one CLI call at a
time (`SEARCH_FANOUT_CONCURRENCY`, chosen from a measured sweep of concurrency 1/2/3 — see that
file's comment), which measured 0/9 `SECURE_STORE_UNAVAILABLE` across four separate runs. The trade
is latency: a full 9-destination scan now takes roughly 42-48 seconds sequentially, versus 3-8
seconds when it was silently dropping half the destinations. That latency — not a fabricated flake
rate — is the honest reason the judged, on-stage path stays on deterministic demo data: an
unpredictable 40-second wait is worse on stage than instant, reliable demo inventory, independent of
how reliable the provider itself turns out to be.

## Onboarding

`/onboarding` collects the traveller in eight steps: calendar and privacy, home airport, how far to
reach, the hard limits, what they travel for, a dream list, a companion, and how often to speak up.

What makes it more than a form:

- **The answers are the rules.** Step four becomes the pass/fail constraints the engine cannot be
  talked out of. Steps three, five and six only ever move a score, and each screen says which it is.
- **Nothing is trusted.** The profile arrives from a browser, so `sanitiseProfile` rebuilds every
  field on the server against documented bounds — a hard budget a client could set to infinity would
  not be a hard budget. Unrecognised fields are dropped rather than stored.
- **Skipping is a first-class path.** “Run on the prepared demo traveller” clears the profile, so a
  judged run never depends on somebody completing a wizard on stage. With no profile stored, the
  engine uses the prepared traveller and `/settings` says so.

The introduction and coach marks are separate, and still there: press `?` anywhere, or use the button
in the top bar.

- A three-panel first-run introduction: the trigger, what it reads, and what to trust.
- Coach marks that follow the traveller through the flow, anchored to the thing they describe, and
  non-blocking — the page underneath stays usable.
- A guide with how it works, the flight layer, the screens, a glossary and the sceptical questions.
- Replay the introduction or restart the tour at `/demo`.

## Environment

See `.env.example`. Nothing is required to run the demo. Secrets are server-only, and `/api/health`
reports which adapter is live without leaking any of them.

**The calendar is in-memory and fictional, on purpose — there is no Google OAuth in this build.**
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are read only to decide what `/api/health` reports; no
`/api/auth/google` route exists, so setting them would not connect anything. Onboarding offers
"Google Calendar" as a real option in the design, states plainly that it is not connected in this
build, and every calendar screen — the window at `/calendar`, and the trip's calendar card at
`/trip` — says the same thing in its own words: this is CALENDAIR's deterministic prepared world,
and a real connection would read the same way from an actual calendar. The "calendar write" at the
end of a booking populates an in-memory `calendarBlocks` array on the session, shown as *"the blocks
CALENDAIR would write,"* never as "added to your calendar."

## Documents

- `HACKATHON.md` — the judge-facing brief
- `DEMO_SCRIPT.md` — the three-minute talk track
- `AGENT_HANDOFF.md` — current engineering status
- `BUILD_STATE.md` — what the repository looked like before the onboarding work
- `REBRAND_AUDIT.md` — the Empty Seat → CALENDAIR migration, evidenced
- `BUILD_EVIDENCE.md` — what was actually built with Qoder
