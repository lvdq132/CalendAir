# Engineering status

## What exists

The CALENDAIR product, mobile-first, end to end.

| Area | Path | State |
|---|---|---|
| Domain types | `src/lib/calendair/types.ts` | Complete; extends the starter contracts |
| Traveller profile | `src/lib/calendair/profile.ts` | Type, documented bounds, server-side sanitiser, pure projection to taste |
| Money | `src/lib/calendair/money.ts` | Indicative rates, used only to express a ceiling in a fare's currency |
| Time arithmetic | `src/lib/calendair/time.ts` | Timezone-correct useful hours, nights, buffers |
| Hard constraints | `src/lib/calendair/constraints.ts` | Nine pass/fail rules, each with a named rejection |
| Escape Score | `src/lib/calendair/scoring.ts` | Nine weighted factors, summing to the score exactly |
| Opportunity engine | `src/lib/calendair/engine.ts` | Window → search → filter → score → one recommendation |
| Booking state machine | `src/lib/calendair/flow.ts` | Reverify, price change, bounded replan, assert, write back |
| Session store | `src/lib/calendair/store.ts` | In-memory, TTL-swept |
| Demo world | `src/lib/calendair/demo/` | Deterministic calendar, companion, taste, inventory |
| Provider boundary | `src/lib/atlas/` | Interface, demo adapter, **live SkillAtlasAdapter**, unwired atrip adapter |
| API | `src/app/api/calendair/…`, `/api/health` | session, scan, authorize, accept-price, book, fulfilment, state |
| Interface | `src/app/(calendair)/`, `src/components/calendair/` | Nine screens |
| Onboarding | `src/components/onboarding/` | Eight-step profile wizard at `/onboarding`, plus intro, coach marks, guide, glossary |

## Verification

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test` | 60 passed |
| `npm run test:e2e` | 31 checks passed across all four scenarios |
| `npm run build` | success, 15 routes |

## Demo numbers

Shanghai Pudong, next Friday 14:00 to Monday 10:00 — a 68-hour window, shared with Sophie.

| Candidate | Outcome |
|---|---|
| Dubai, non-stop, CNY 4,980 | **Recommended · Escape Score 91** |
| Singapore, non-stop, CNY 3,260 | Alternate · 80 |
| Tokyo, non-stop, CNY 2,180 | Alternate · 79 |
| Dubai, CNY 4,120 | Rejected · reference price only |
| Tokyo business, CNY 6,900 | Rejected · over your budget |
| Tokyo, two stops, CNY 1,480 | Rejected · too many connections |
| Kyoto, one stop | Rejected · not enough time there |
| New York, non-stop | Rejected · returns too late |

## The Atlas interface, now known

The official Skill is installed at `.agents/skills/atlas-flight-booking/` (documentation only — six
markdown/YAML files, no executable code). It answers the question that previously blocked the live
adapter: **Atlas is a local CLI, not an HTTP API.** No endpoint needs to be guessed, and none should be.

| Fact | Value |
|---|---|
| Transport | `atlas-flight` CLI, JSON on stdout (`--json` on every command) |
| Install | `uv tool install --force --python 3.12 atlas-flight-booking==0.3.12` |
| Installed here | `uv 0.12.5`, `atlas-flight 0.3.12` (minimum supported is 0.3.12) |
| Auth | `auth status --json` → `auth login --json` → `auth poll --timeout 120 --json` |
| Search | `search --origin … --destination … --depart YYYY-MM-DD --adults N --json` |
| Offers | `offer list --search-id …`, `offer verify --offer-id …` |
| Price increase | `booking confirm-price --booking-id …` |

Mapping onto `AtlasAdapter`, which turns out to line up closely:

| Our method | CLI command |
|---|---|
| `getStatus()` | `auth status --json` — gives `ticketing_available`, `ticketing_blocker` |
| `searchFlights()` | `search …` — offers returned **inline** in `data.offers`; fan-out across all 9 catalogue destinations in parallel when no destination given |
| `verifyOffer()` | `offer verify --offer-id …` — stores `booking_id` + `travelers` for the order step |
| `createBooking()` / `getBookingStatus()` | see `references/booking-workflow.md` and `order status` |

Rules the contract imposes that the product already honours: branch on the response `code` and never
on `message`; preserve opaque IDs exactly; an offer with `price_status=reference` may never be verified
or booked; a price increase requires fresh explicit acceptance; never retry order creation or payment.

Read `references/cli-contract.md` before constructing any command, and
`references/error-handling.md` for every non-success code.

**Current authorization state:** `AUTHORIZED`, `authenticated: true`, `search_available: true`,
`ticketing_available: false` (`TICKETING_ACTIVATION_REQUIRED`). Complete the remaining activation steps
at `https://www.atriptech.com/#/workspace` to unlock price verification, order creation, and ticketing.
With `ATLAS_INTEGRATION_MODE=skill` the live adapter is active; offers currently return
`price_status: "reference"` and the booking flow correctly stops at `authorize()` until ticketing
is enabled.

## Known gaps

- **Ticketing not yet activated.** The adapter is implemented and live. With `ATLAS_INTEGRATION_MODE=skill`,
  flight search calls the real CLI and returns real offers (currently all `price_status: "reference"`).
  Full booking requires completing `TICKETING_ACTIVATION_REQUIRED` in the ATRIP workspace. Once active,
  `bookable: true` offers will flow through `verifyOffer` → `createBooking` → `getBookingStatus`
  without any code change.
- Google Calendar OAuth is not wired. `/onboarding` offers it and states on the card that it needs a
  one-time authorisation from the account owner; until then the calendar layer is the deterministic
  demo world.
- Qwen is not called. The provider boundary exists but no explanation call is made yet.
- `/settings` shows the live profile and routes back into onboarding to change it. Editing an
  individual field in place is not implemented; answering the questions again is the path.
- `npm run test:e2e` drives the HTTP API rather than a browser. A Playwright pass over the UI would
  be the next addition. The wizard has been smoke-tested manually in a browser.
- Sessions are in memory and do not survive a server restart, which is fine for a stage demo.
- Qoder usage is recorded in `BUILD_EVIDENCE.md`. Keep it truthful; do not claim what was not done.

## History

This repository began as EMPTY SEAT (a coalition salvage market for expiring inventory). That
prototype and its specs were removed on 19 Aug 2026 when the project pivoted to CALENDAIR, so the
tree contains only the current product — no distracting leftovers. The directory is still named
`empty-seat`; renaming it is cosmetic and optional.
