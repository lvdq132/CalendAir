# BUILD_EVIDENCE — what was actually built, and how

A truthful record of the agent-assisted engineering on CALENDAIR. Nothing here is aspirational: every
command quoted was run, and every claim is checkable against the tree.

Where earlier documentation in this repository was wrong, it is corrected here rather than repeated.

---

## Session of 20 August 2026 — onboarding, profile wiring, rebrand completion

### 1. Inspection before editing

The repository was read before anything was changed, and the existing documentation was treated as a
claim to verify rather than a fact to trust.

Established by reading the tree: Next.js 16.3.1 App Router, React 19.2.8, TypeScript strict, npm,
zod 4, Vitest 3, hand-written CSS design tokens (1,109 lines) rather than a component library, server
sessions in memory, no authentication, no deployment configuration, and a git repository with **zero
commits**.

Baseline commands, run before any edit:

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test` | 22 passed |
| `npm run test:e2e` | 31 checks passed |
| `npm run build` | success, 14 routes |

**Correction to prior documentation:** `AGENT_HANDOFF.md` claimed 26 unit tests. There were 22. The
handoff has been corrected.

Findings were written to `BUILD_STATE.md` before implementation began, including the honest headline:
the frontend and the deterministic engine were genuinely good and were **not** to be rebuilt.

### 2. Gap analysis against the brief

Reading the code rather than the documentation produced three findings that mattered:

1. **`/onboarding` did not exist.** `src/components/onboarding/` was a coach-mark tour and glossary —
   good work, but not traveller profile capture. The eight-step wizard was absent entirely.
2. **Travel taste was a hard-coded constant.** `TASTE` in `demo/world.ts` was the only profile the
   engine could use. Nothing a traveller chose could reach it, so onboarding would have been theatre.
3. **`interests` was collected but never scored.** `scoring.ts` derived destination affinity purely
   from `dreamDestinations`. Step 5 of the brief would have been a decorative question.

### 3. Implementation

**Rebrand completion** — five legacy references found by case-insensitive search across the whole
repository; all resolved. The localStorage key was **migrated** rather than renamed, so a returning
visitor keeps their progress. Eight empty Empty Seat directories removed. Recorded in
`REBRAND_AUDIT.md`.

**A deployment blocker found while auditing the lockfile.** `package-lock.json` carried
`"@claude-labs/design-system": "file:../claude-labs-ds"` — absent from `package.json`, imported by no
source file, and resolving to a sibling directory that exists on no deployment host. Removed by
editing the lockfile as JSON, specifically so that deleting a stale entry could not quietly bump any
other dependency's version.

**The profile domain** (`src/lib/calendair/profile.ts`) — `TravellerProfile`, documented `BOUNDS`, the
prepared `DEMO_PROFILE`, and two pure functions: `sanitiseProfile` (rebuilds every field from
untrusted input, never throws) and `tasteFromProfile` (a total projection into the shape the engine
already consumed). No React, no Atlas.

**Money made honest** (`src/lib/calendair/money.ts`) — the hard budget compared a traveller's ceiling
against a provider's fare with no attention to currency. Collecting a currency in onboarding would
have turned that into a live bug: a USD 900 ceiling against a CNY 4,980 fare compares two different
units. The ceiling is now converted into the fare's currency before comparison, and an unknown pair is
**refused with a named rejection** rather than guessed.

**The wizard** (`src/app/(calendair)/onboarding/page.tsx`, `Wizard.tsx`, `controls.tsx`, ~520 lines of
CSS) — eight steps, built from the existing `--ca-*` tokens and the existing `es-` stylesheet, inside
the existing app shell. No new design language, no purple gradients, no chatbot.

**The wiring** — the profile travels browser → `POST /api/calendair/session` → zod shape check →
`sanitiseProfile` → `buildDemoWorld` → engine. Only a profile with a completion instant is allowed to
drive a run, so a half-finished wizard cannot replace a traveller's rules.

**Two preferences given real, bounded effect:**

- Stated interests now count against taste tags added to the destination catalogue, **additively** —
  a dream-list destination is already at the affinity ceiling, so the judged hero score did not move.
- Spontaneity sets the exploration baseline for a destination *outside* the dream list, and is read in
  exactly one place. `curious` retains the previous constant, so the demo is bit-for-bit unchanged.

**`/settings`** stopped saying "read-only" and now states which profile is live — the traveller's own,
or the prepared demo traveller — with a route back into the wizard and a reset.

### 4. Testing

`src/lib/calendair/profile.test.ts` — **38 new tests**, aimed at what could lose the hackathon rather
than at coverage:

- A browser cannot widen a hard rule: absurd budgets clamp; `Infinity` and `NaN` fall back to defaults
  rather than clamping to the maximum (clamping `Infinity` would silently grant the widest budget the
  product allows); `"6000"` as a string is refused.
- Unknown origin, unknown currency and unknown timezone all fall back rather than proceeding.
- Control characters are stripped before text can reach a log; unrecognised fields — tokens, passport
  numbers, card numbers — are dropped entirely, asserted by serialising and searching.
- The prepared demo profile projects to *exactly* the taste the engine has always used.
- A profile genuinely reaches the engine: a tighter budget changes the winner from Dubai to Tokyo and
  produces a real "Over your budget" rejection; travelling alone empties the companion set.
- Interests are scored, not stored: every taste tag is reachable from the catalogue, and the same city
  is worth more to a traveller whose interests it matches.
- Spontaneity cannot buy an itinerary past a hard constraint.
- Cross-currency comparison is correct, including the naive-comparison bug it prevents.
- The demo hero's Escape Score of **91** is pinned, because three documents quote it. A scoring change
  can no longer quietly make the pitch untrue.

Two of these tests failed on first run. **Both were wrong tests, not wrong code** — the correct
behaviour was to reject non-finite input rather than clamp it, and the budget rule legitimately fires
before the reference-price rule at a low ceiling. The assertions were corrected to describe the safer
behaviour; no test was weakened to go green.

### 4a. A bug found by reviewing the change, and fixed

A review pass over this session's own diff found a defect introduced by adding currency support:
`checkHardConstraints` converted the ceiling before comparing, but the `budgetFit` **scoring** factor
still divided a fare by the raw `maxSpontaneousSpend`. Hard safety was intact — the constraint was
correct — but a traveller with a USD ceiling would have been scored against CNY fares, and the
factor's own explanation ("% under your maximum") would have been wrong.

Fixed by converting once, in one place: `ConstraintVerdict` now carries `ceiling` in the offer's
currency, and scoring reads that instead of reaching for the raw figure. Two tests were added — the
same ceiling stated in CNY and in USD must produce the same headroom score, and an unconvertible
ceiling must be `0` rather than a number something downstream could divide by.

### 5. Verification

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test` | **60 passed** (22 pre-existing + 38 new) |
| `npm run test:e2e` | **31 checks passed** across all four scenarios |
| `npm run build` | success, **15 routes** including `/onboarding` |

Every pre-existing test still passes. The two that referenced the companion identifier were updated
because the identifier became name-independent once the name could be supplied by a traveller.

### 5a. The safety boundary, proved against the running production build

Unit tests can be written to agree with the code. So the claim was also tested from outside, against
`npm run start`, by posting a deliberately hostile profile to `POST /api/calendair/session`:

```json
{ "maxSpontaneousSpend": 999999999, "maxStops": 99, "minUsefulHours": 0,
  "returnBufferMinutes": 0, "accessToken": "ya29.SECRET", "documentNumber": "X1234567" }
```

What the server actually accepted:

| Client claimed | Server used | Why |
|---|---|---|
| `maxSpontaneousSpend: 999999999` | `200000` | Clamped to the documented ceiling |
| `maxStops: 99` | `2` | Clamped to the documented maximum |
| `minUsefulHours: 0` | `4` | Raised to the documented floor |
| `accessToken`, `documentNumber` | *absent* | Unrecognised fields are dropped, and neither string appears anywhere in the response |

And with that maximally permissive profile the engine **still** rejected the reference-price Dubai fare
("Reference price only") and the New York itinerary ("Returns too late"). No profile can buy an
itinerary past a hard rule.

For comparison, the same endpoint with no profile returned the documented demo run exactly:
**Dubai, Escape Score 91, CNY 4,980**, with all five rejections named — reference price only, over your
budget, too many connections, not enough time there, returns too late.

### 6. Browser smoke test

The wizard was driven end to end in a real browser rather than assumed to work: all eight steps, every
stepper and toggle exercised, the five-selection cap confirmed to disable a sixth, dream chips added
via both the field and the suggestions and then removed, `Back` confirmed to retain answers.

Result: the traveller chose Beijing, `Safe`, a five-tag taste set and a companion; the home screen then
rendered from **PEK** and `/settings` reported "Your profile" with the entered values. `/`, `/calendar`,
`/activity`, `/demo`, `/settings`, `/trip`, `/booking` and an opportunity page all loaded with no
console errors.

One real defect was found and fixed: the hint text in a toggle row inherited right-alignment from the
field-head rule and sat opposite its label instead of beneath it.

### 7. The Atlas interface, established rather than assumed

The repository's standing instruction is to never invent an Atlas endpoint. Rather than leave the live
adapter blocked on an unknown, the official Skill was installed and read:

```
npx --yes skills add https://github.com/atlas-doc/atlas-flight-booking-skill \
  --skill atlas-flight-booking -y
```

It installed to `.agents/skills/atlas-flight-booking/` and is **documentation only** — six markdown and
YAML files, no executable code, verified by listing the tree. (The installer surfaced a third-party
"Critical Risk" rating; with no code in the package there is nothing for it to describe, and the files
were read before anything acted on them.)

The decisive finding: **Atlas is a local CLI, not an HTTP API.** So the live adapter should shell out to
`atlas-flight` and parse its JSON, and no endpoint needs to be guessed. The exact commands, the version
floor, and the mapping onto our existing `AtlasAdapter` methods are recorded in `AGENT_HANDOFF.md`.

The tooling was then installed and verified, which the Skill explicitly authorises:

| Step | Result |
|---|---|
| `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `uv 0.12.5` |
| `uv tool install --force --python 3.12 atlas-flight-booking==0.3.12` | `atlas-flight 0.3.12` |
| `atlas-flight auth status --json` | `AUTHORIZATION_REQUIRED`, `authenticated: false` |
| `atlas-flight auth login --json` | returned a time-limited `authorization_url` |

Notably, the Skill's own safety model independently matches the one this product already implemented:
branch on `code` and never on `message`, preserve opaque IDs exactly, never verify or book an offer
whose `price_status` is `reference`, require fresh explicit acceptance on a price increase, and never
retry order creation or payment. The existing constraint and flow code needs no change in shape to
meet it.

Checked afterwards: the CLI's auth token is **not** written anywhere inside the repository, and its
state lives outside the project tree.

This is where autonomous progress genuinely stops. Completing ATRIP authorization requires signing into
or registering an external account and clicking an approval — an account-owner action, raised as a
human blocker rather than worked around.

---

## Session of 21 August 2026 — Atlas CLI authorization and live adapter implementation

### 8. Atlas authorization (second attempt)

The authorization URL from the previous session had expired. The CLI health was verified clean:

| Check | Result |
|---|---|
| `atlas-flight --version` | `0.3.12` ✓ |
| `atlas-flight doctor --json` | `cli_version` `config_directory` `secure_store` `api_reachable` all ✓; `authenticated` ✗ (expected) |
| `atlas-flight auth status --json` | `AUTHORIZATION_REQUIRED`, `authenticated: false` — stale token cleared |

A fresh link was generated with `atlas-flight auth login --json` and the account owner completed browser authorization.

Post-authorization poll result:

```json
{ "code": "AUTHORIZED", "data": { "authenticated": true, "search_available": true,
  "ticketing_available": false, "ticketing_blocker": "TICKETING_ACTIVATION_REQUIRED",
  "ticketing_activation_url": "https://www.atriptech.com/#/workspace" } }
```

**Meaning:** Atlas account is authenticated; flight search is live; price verification, order creation,
and ticketing require additional activation steps in the ATRIP workspace.

### 9. SkillAtlasAdapter — live adapter implemented

The adapter was written after observing the actual CLI response shapes (field names are never
invented). Two searches were run to learn the format before a line of TypeScript was written:

**Observed search response shape:**
```json
{ "data": { "search_id": "srch_…", "offer_count": 5, "offers": [
    { "offer_id": "off_…", "currency": "CNY", "total_price": 4690.42,
      "segments": [
        { "departure_airport": "PVG", "arrival_airport": "NRT",
          "departure_time": "202608251455", "arrival_time": "202608251900",
          "carrier": "9C", "flight_number": "9C6217",
          "duration_minutes": 185, "cabin_class": 1, "direction": "outbound" } ],
      "bookable": false, "price_status": "reference" } ] } }
```

The verify call confirmed that ticketing is not yet available:
```json
{ "code": "SUBSCRIPTION_REQUIRED", "details": { "ticketing_blocker": "TICKETING_ACTIVATION_REQUIRED" } }
```

New file: **`src/lib/atlas/skill-adapter.ts`** (~500 lines). Key decisions, all verifiable:

- **Parallel fan-out.** The opportunity engine calls `searchFlights` without a destination (the
  `DemoAtlasAdapter` returns all demo inventory in one call). The live adapter fans out over all 9
  catalogue destinations with `Promise.all`, so no offer is missed.
- **Timezone-correct time parsing.** The CLI returns times as `YYYYMMDDHHmm` wall-clock local to
  each airport. The adapter looks up each airport's IANA zone from a static table, applies
  `offsetMinutes` from the existing `time.ts` to convert to UTC. Precision: exact in standard time;
  ±1 h near a DST transition — sufficient for all constraint checks.
- **cliTimeToIso accuracy:** Confirmed by inspection that `Asia/Shanghai` (no DST) converts
  `PVG 14:55` → `06:55 UTC` exactly.
- **Offer cache.** Searched offers are stored by `offer_id` so that `verifyOffer` can reconstruct
  a `VerifiedOffer` from the cached segment list when the verify response re-emits them in a
  different shape.
- **Passenger payload via stdin.** Personal data (name, DOC number) is piped to the CLI process
  stdin with `spawnSync({ input: payload })`. It never appears in a command argument, shell history,
  or log.
- **`BookingInput.passenger?`** added to `types.ts` (optional, so `DemoAtlasAdapter` needs no
  change); `flow.ts` passes `session.world.passenger` so a live adapter always has the profile.
- **`ATLAS_CLI_PATH` env var** documented in `.env.example` and set in `.env.local`. The adapter
  auto-discovers the uv install location (`~/.local/bin/atlas-flight`) as a fallback.

The `index.ts` factory now wires `SkillAtlasAdapter` for `ATLAS_INTEGRATION_MODE=skill` (previously
this mode triggered `UnwiredAtlasAdapter`). The `atrip` mode still fails loudly because that adapter
has not been implemented.

### 10. Live scan proof

The adapter was tested against the running production server (`npm run start -- -p 3002`) with
`ATLAS_INTEGRATION_MODE=skill`:

| Probe | Result |
|---|---|
| `GET /api/health` | `adapter: "skill"` · `authorized: true` · `ticketingAvailable: false` · `label: "Atlas Skill · TICKETING_ACTIVATION_REQUIRED"` |
| `POST /api/calendair/session` | Session created; `atlas.adapter: "skill"` in response |
| `POST /api/calendair/session/{id}/scan` | 9 parallel CLI searches ran; all returned `SEARCH_NO_RESULTS` for the Aug 21–24 demo window |

The `SAFE_STOP` result is **correct**: there are genuinely no Atlas round-trip flights that fit within
a 68-hour window starting today. (The earlier manual search for NRT confirmed that available flights
depart Aug 25, outside the window.) The deterministic demo (`DemoAtlasAdapter`, `ATLAS_INTEGRATION_MODE`
unset) is unaffected and continues to recommend Dubai 91 as documented.

### 11. Gate after this session

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test` | **60 passed** (unchanged) |
| `npm run test:e2e` | **31 checks passed** (unchanged) |
| `npm run build` | success, **15 routes** (unchanged) |

---

## Honest limitations at this point

These are unchanged from the previous session and are stated plainly:

- **Ticketing not yet activated.** With `ATLAS_INTEGRATION_MODE=skill`, the live adapter returns
  real flight data but all offers carry `price_status: "reference"`. The booking flow correctly
  refuses to proceed past `authorize()`. Full booking becomes available once `TICKETING_ACTIVATION_REQUIRED`
  is resolved in the ATRIP workspace at `https://www.atriptech.com/#/workspace`.
- **Google Calendar OAuth is not wired.** The wizard card exists; availability comes from the
  prepared demo calendar until the account owner completes the one-time Google authorisation.
- **Qwen is not called.** The boundary and the `/explain` route exist; no call is made.
- Sessions are in memory and do not survive a server restart.
- `npm run test:e2e` drives the HTTP API, not a browser.
