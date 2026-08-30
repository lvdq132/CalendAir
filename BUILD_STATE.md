# BUILD_STATE — inspection before implementation

Recorded 20 Aug 2026, before this session's changes. Every command below was actually run; the
results are copied from the terminal rather than assumed.

**This whole file is a historical snapshot, deliberately left as it was recorded — the counts,
gaps and adapter list below are what the repository looked like on 20 Aug, not what it looks like
now.** For the current numbers (114 unit tests, 31 e2e checks, 21 routes, four Atlas adapters
including live and hybrid) see `README.md` and `AGENT_HANDOFF.md`. Onboarding, the traveller
profile, the live/hybrid Atlas adapters and most of what "P0 gaps" below lists have since been
built; this file is kept as evidence of where the build actually started, not edited to keep pace
with it.

## Stack, as found

| Aspect | Finding |
|---|---|
| Framework | Next.js **16.3.1**, App Router, React **19.2.8** |
| Language | TypeScript 5, strict; path alias `@/*` → `src/*` |
| Package manager | npm (`package-lock.json` present, no pnpm/yarn lockfile) |
| Styling | Hand-written CSS design tokens in `src/app/calendair.css` (1,109 lines) + Tailwind 4 available via PostCSS but barely used |
| Fonts | Playfair Display (display) + Inter (interface), via `next/font` |
| Tests | Vitest 3 (`src/lib/calendair/engine.test.ts`) + a Node HTTP end-to-end script |
| Validation | zod 4 |
| State | React context (`SessionProvider`), server sessions in memory |
| Persistence | In-memory `Map` with a 2-hour TTL sweep; `sessionStorage` for the session id |
| Auth | None. No user accounts anywhere |
| Deployment config | None committed — no `vercel.json`, no Dockerfile, no CI |
| Git | Repository initialised but **zero commits**; every file untracked |

## Verified command results

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test` | **22 passed** (the handoff doc claimed 26 — corrected) |
| `npm run test:e2e` | **31 checks passed** across `perfect`, `price-change`, `sold-out`, `pending` |
| `npm run build` | success — 14 routes, 8 API handlers |

## What genuinely works

The core loop is real and deterministic, and it is the strongest part of the repository.

- **Time arithmetic** (`time.ts`) — useful hours computed on destination-local dates via `Intl`,
  not elapsed milliseconds.
- **Hard constraints** (`constraints.ts`) — nine pass/fail rules, each returning a *named* rejection
  ("Over your budget", "Reference price only", …). No model is consulted.
- **Escape Score** (`scoring.ts`) — nine weighted factors that provably sum to the score; a test
  asserts the sum.
- **Booking state machine** (`flow.ts`) — reverify before write, price-change stop, bounded replan,
  `SAFE_STOP`, provider-state assertion before anything says confirmed.
- **Provider boundary** (`src/lib/atlas/`) — `AtlasAdapter` interface, a deterministic demo adapter,
  and an `UnwiredAtlasAdapter` that throws rather than silently falling back to demo inventory.
- **Eight screens** built from a genuine component language: warm ivory, deep navy, restrained gold,
  green reserved for verified state. This is the design source of truth and is not being rebuilt.

## What is mocked, and labelled as such

- Flight inventory is deterministic demo data (`demo/inventory.ts`). `/api/health`, the home-screen
  badge and `/demo` all report the mode. The unwired live adapter fails loudly.
- The calendar is a fictional deterministic world (`demo/world.ts`) — a released Friday client review
  that opens 68 hours to Monday.
- Sandbox booking results are labelled as test results.

## What is missing or broken — the real P0 gaps

1. **No `/onboarding` route at all.** This is the largest gap against the brief. The existing
   `src/components/onboarding/` is a *coach-mark tour and glossary*, not traveller profile capture.
   The eight-step wizard (calendar/privacy, home, spontaneity, hard preferences, taste, dream list,
   companion, notifications) does not exist.
2. **Travel taste is a hard-coded constant.** `TASTE` in `demo/world.ts` is the only profile the
   engine can ever use. Nothing a traveller chooses can reach the engine.
3. **`interests` is collected but never scored.** `scoring.ts` derives destination affinity purely
   from `dreamDestinations`; `taste.interests` is read by no calculation. Onboarding step 5 would be
   decorative unless this is wired.
4. **`/settings` is read-only** and says so on screen.
5. **Rebrand residue** — `src/lib/onboarding/store.ts` writes the localStorage key
   `empty-seat.onboarding.v1`; `package-lock.json` still carries `"name": "empty-seat"`.
6. **Eight empty directories** left from the Empty Seat structure (`src/components/market/`,
   `merchant/`, `mission/`, `landing/`, `booking/`, `trip/`, `src/lib/booking/`, `src/lib/inventory/`).
7. **A stale comment** in `calendair.css` refers to "the archived prototype at `/legacy`", a route
   that no longer exists.
8. Test coverage is one file. The brief's list of loss-causing behaviours is largely covered by the
   e2e script, but profile validation, secret-leakage and privacy assertions have no unit tests.
9. Google Calendar OAuth and Qwen are unwired (both behind boundaries, both degrade honestly).

## Safest implementation path

The frontend and the engine are good. The work is **additive**, in this order:

1. Finish the rebrand (localStorage key with a migration, package metadata, dead directories).
2. Add a `TravellerProfile` domain type with a zod schema that **clamps** every number server-side,
   plus a pure `tasteFromProfile()` conversion. No React.
3. Build `/onboarding` from the existing component language and CSS tokens.
4. Let the profile reach the engine through session creation — validated on the server, never
   trusted from the client. Absent profile ⇒ the prepared demo profile, so the judged demo and the
   e2e script keep working untouched.
5. Make `interests` genuinely affect destination affinity, **additively**, so the hero's Escape Score
   of 91 does not move and existing assertions hold.
6. Make `/settings` show the live profile and offer a retake.
7. Add unit tests for clamping, privacy and leakage.

Nothing above requires rebuilding a screen, and nothing above weakens an existing test.
