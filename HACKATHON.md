# CALENDAIR — hackathon brief

**Track fit:** Flights & Aviation · AI Agent Startups · Other Travel Innovations
**Sponsors:** Atlas APIs · Alibaba Cloud · Qoder
**Deadline:** 30 Aug 2026 · three-minute video demo

## The category

Not AI trip planning. **Proactive travel opportunity commerce.**

The differentiator is the absence of an initial travel query. There is no destination box anywhere in
this product. The agent observes permitted calendar availability, detects a viable window, combines
it with shared availability and personal travel intent, and creates a travel opportunity the
traveller would never have searched for.

**CALENDAIR creates demand that did not exist five minutes earlier.**

## Innovation

| Evidence | Where it is visible |
|---|---|
| A cancellation becomes an opening | Home · "68 hours opened", with the released commitment named |
| Two calendars matched without disclosure | `/calendar` · free/busy only, stated on screen |
| The agent creates the opportunity | Home · one escape appears without any input |
| Five seconds to understand | "68 hours free → Dubai, Escape Score 91" |
| More than a recommendation | `/activity` · search, filter, verify, replan, confirm |
| Preferences become rules, not decoration | `/onboarding` · eight steps that split hard limits from taste |

## Feasibility

- Typed provider adapter with a demo implementation and an explicitly unwired live one.
- Deterministic engine: constraints, scoring and time arithmetic in ordinary code, unit-tested.
- An explicit booking state machine with bounded replanning and a safe stop.
- Four repeatable scenarios (`perfect`, `price-change`, `sold-out`, `pending`) switchable at `/demo`.
- `npm run test:e2e` drives the entire loop over HTTP and asserts the safety properties.
- Deployable Next.js build; server-only secrets; a health endpoint that leaks none of them.

### Compliance and safety, in the product rather than the pitch

- Free/busy only; a companion's event titles are never requested, stored or shown.
- A stated preference cannot widen a hard rule: the profile arrives from a browser and is rebuilt on
  the server against documented bounds before the engine sees it.
- A budget is a rule only once both sides are in the same currency; an unknown pair is refused rather
  than guessed.
- Every consequential step waits for a person.
- The live fare is re-read immediately before every write.
- A price increase stops the flow; a sold-out fare produces a replacement to accept, not a swap.
- A successful response is not a journey — fulfilment is asserted before anything says confirmed.
- The calendar is written only after that.
- Sandbox results are labelled as test results wherever they appear.
- No titles, tokens, document numbers or payment details reach the activity log.

### Cost control

Deterministic code handles every critical calculation. Model calls are reserved for subjective
wording, so the core runtime flow does not depend on a top-tier model.

## Atlas

Atlas is the agent's action layer: real routes, schedules and fares, plus verification and ticketing.
It sits behind `AtlasAdapter`, so the rest of the app never knows whether it is talking to the Atlas
Flight Booking Skill or to ATRIP.

The four capability groups are respected exactly: fare search is read-only and may run autonomously;
verify-and-book, payment, and post-booking all sit behind a human checkpoint. A reference-price offer
is rejected before it can reach any booking state.

**No endpoint is guessed in this repository.** With `ATLAS_INTEGRATION_MODE` unset the app runs on
deterministic inventory and says so on every screen. Set to `skill` or `atrip` it selects an adapter
that must first be implemented from the interface actually issued to the account, and fails loudly
rather than substituting demo data for a live call.

## Alibaba Cloud

Deployment target, with Qwen available through a provider boundary for preference interpretation and
explanation only. It is never given pricing, constraints, booking state or fulfilment.

## Qoder

The spec-driven build process — PRD → specify → plan → implement → validate — with the evidence
preserved in `BUILD_EVIDENCE.md`, alongside `BUILD_STATE.md` (the repository as found, with the
baseline commands actually run) and `REBRAND_AUDIT.md`. Where earlier documentation overstated
something, the correction is recorded rather than the claim repeated.

## Judging alignment

| Criterion | Weight | How it is met |
|---|---|---|
| Innovation | 30% | Calendar availability creates travel demand before any search |
| Feasibility | 30% | Typed adapters, deterministic engine, state machine, tests, repeatable scenarios |
| Use of Qoder | 20% | Spec-first sequence with preserved evidence |
| Demo | 20% | The full loop on screen in three minutes — see `DEMO_SCRIPT.md` |

## Mistakes deliberately avoided

- No generic chatbot travel planner.
- No mocked fares presented as live.
- No autonomous payment.
- No Sandbox ticket described as a real booking.
- No free-form model arithmetic for prices or schedules.
