# CALENDAIR — Turn free time into a trip.

CALENDAIR is an agentic travel platform for the Alibaba Cloud × Atlas Agentic AI Hackathon. It turns an unexpected calendar opening into one verified, safely bookable trip recommendation.

> The agent can be spontaneous. The transaction cannot.

## Problem

Travel usually starts with a search form, a date picker, and too many options. Real life works the other way around: time opens up first. A meeting moves, a weekend becomes free, or two people suddenly share the same window. The hard part is converting that fragile opening into a trip that actually fits time, budget, rules, companions, and booking reality.

## Solution

CALENDAIR starts from free/busy availability, builds a constrained travel window, checks companion overlap, searches flight opportunities, filters out rule-breaking options, scores what remains, and presents one escape with the reason it fits.

The demo is mobile-first and decision-first: one recommended trip, clear rejection reasons, and explicit approval checkpoints before anything consequential happens.

## Agentic workflow

1. Detect an open calendar window from free/busy state.
2. Match the traveller and companion availability.
3. Generate candidate destinations from the profile and catalogue.
4. Search or simulate flight inventory depending on configured provider mode.
5. Apply hard constraints in deterministic code.
6. Score viable trips using deterministic factors.
7. Explain the selected escape in human language.
8. Stop for human approval.
9. Re-read and reverify live state before booking.
10. Confirm the provider state before showing a confirmed trip.

## Architecture

- `src/app/(calendair)/` — Next.js app routes for the product screens.
- `src/components/calendair/` — reusable CALENDAIR screen and UI components.
- `src/lib/calendair/` — domain logic: demo world, constraints, scoring, booking state, and session persistence.
- `src/lib/atlas/` — provider boundary and Atlas adapter implementations.
- `src/lib/llm/` — optional Qwen language layer for wording only.
- `scripts/` — demo, end-to-end, and sandbox support scripts.

The important boundary is deliberate: React renders state, provider adapters fetch/verify/order, and core travel decisions stay in ordinary TypeScript with tests.

## Atlas integration

CALENDAIR supports several Atlas modes through `ATLAS_INTEGRATION_MODE`:

- unset — deterministic demo adapter for local judging and reliable rehearsal.
- `skill` — Atlas Flight Booking Skill / `atlas-flight` CLI for live search where the local machine is authenticated.
- `hybrid` — live Atlas search through the CLI, then an honest safe-stop at fare verification until account ticketing is active.
- `atrip` — unwired placeholder that fails loudly instead of pretending to be live.

Live Atlas search requires the Atlas CLI to be installed and authorized on the same host running the app. The app does not ship or commit Atlas credentials.

## Alibaba Cloud Qoder usage

Qoder was used as the agentic engineering environment for building and hardening the project: implementing the CALENDAIR flow, maintaining safety boundaries, validating test/build state, and preparing the repository for hackathon review.

Alibaba Cloud Model Studio / Qwen is optional and used only for wording the “why this fits” sentence. It never decides prices, constraints, booking state, fulfilment, or calendar writes.

## Safety and human approval checkpoints

CALENDAIR is designed around explicit checkpoints:

- No booking is attempted without human approval.
- Fare, availability, and hard constraints are rechecked immediately before consequential actions.
- A provider `200` response is not treated as confirmation; the provider’s own confirmed state must be observed.
- Demo, sandbox, hybrid, and live states are labeled truthfully in the UI and `/api/health`.
- Calendar content is treated as sensitive; companion matching uses free/busy availability only.
- The demo session store is gitignored and redacts document numbers before disk persistence.

## What is live vs demo/sandbox

- The default local experience runs without real credentials using deterministic demo data.
- `ATLAS_INTEGRATION_MODE=skill` can run live Atlas search only on a locally authorized machine.
- `ATLAS_INTEGRATION_MODE=hybrid` can prove live Atlas search, but live-search offers safe-stop before verification/booking until ticketing activation is available.
- Booking results shown by the demo are sandbox/demo outcomes unless the provider mode and health endpoint prove otherwise.
- Google Calendar is represented as deterministic free/busy demo state in this build; real OAuth calendar sync is not connected.

## Local run

This project uses npm.

```bash
npm install
cp .env.example .env.local
npm run validate
npm run demo
```

Open http://localhost:3000 after the demo server starts.

Useful commands:

```bash
npm run dev          # Next.js development server
npm run demo         # Recommended demo mode
npm run demo:visual  # Fully deterministic visual rehearsal
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run validate     # typecheck + lint + unit tests
npm run test:e2e     # End-to-end API/demo flow checks
npm run build        # Production build
```

## Environment variables

Copy `.env.example` to `.env.local` for local configuration. Do not commit `.env.local` or real credentials.

Key variables:

- `DEMO_MODE` and `DEMO_SCENARIO` control the deterministic demo experience.
- `MAX_REPLANS` bounds automatic replacement attempts.
- `ATLAS_ENV`, `ATLAS_INTEGRATION_MODE`, and `ATLAS_CLI_PATH` control Atlas provider mode.
- `ALIBABA_CLOUD_MODEL_STUDIO_API_KEY`, `QWEN_MODEL`, and `QWEN_BASE_URL` enable optional Qwen wording.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are only used for health/status reporting in this build.

## Hackathon disclosure

CALENDAIR is a hackathon project, not a production travel agency. It demonstrates the product loop, safety model, Atlas provider boundary, and optional Qwen language layer. Any live Atlas behavior depends on the local machine’s Atlas CLI authorization and account capabilities. Secrets, OAuth tokens, payment details, and live session state are not part of the public repository.
