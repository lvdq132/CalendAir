<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CALENDAIR — project rules

**Product:** the in-calendar travel butler. A detected calendar opening becomes a real, verified,
bookable trip. `SPECS/PRD_CALENDAIR.md` in the master package is the functional source of truth; the
numbered design PNGs are the visual source of truth. Rebuild their design language as components —
never render a comp as a screenshot inside the app.

## Non-negotiable

**The agent can be spontaneous. The transaction cannot.**

Search and exploration may run autonomously. Verification, booking, price acceptance, payment and any
other consequential write require an explicit human checkpoint, and the live state is re-read
immediately before every write.

## Rules that must not be broken

1. **Never invent an Atlas endpoint, payload or ticketing state.** Implement `AtlasAdapter` only from
   the installed Atlas Flight Booking Skill or the official ATRIP interface issued to the account.
   Until then the unwired adapter must fail loudly rather than fall back to demo data.
2. **Never present demo inventory as live Atlas data.** The mode is reported by `/api/health`, by the
   badge on the home screen, and at `/demo`.
3. **Never call a booking confirmed because an API call returned 200.** Assert the provider's own
   confirmed state, and label a Sandbox order, PNR or ticket as the test result it is.
4. **Never let a language model own a number.** Timezone arithmetic, budgets, price comparison,
   hard-constraint decisions, booking state and fulfilment are ordinary code with tests. Models are
   for wording only.
5. **Never expose another person's calendar content.** Companion matching uses free/busy only. No
   event titles, access tokens, document numbers or payment details may reach a log or a prompt.
6. **Never write the calendar before fulfilment is confirmed.**
7. **Bounded agent loop:** at most `MAX_REPLANS` (default 2) automatic replacements, each re-checked
   against every hard constraint, then a safe stop. A replacement trip is a new human decision.

## Working in this repo

- Domain logic lives in `src/lib/calendair/` and knows nothing about React or about Atlas transport.
- The provider boundary is `src/lib/atlas/`.
- Screens are under `src/app/(calendair)/`, built from `src/components/calendair/`.
- Design tokens are in `src/app/calendair.css`. Warm ivory surfaces, deep navy ink, restrained gold,
  calm green reserved for verified state. Playfair Display for display, Inter for interface. No
  generic AI aesthetics — no robots, brains, neon grids or chatbot bubbles.
- Mobile-first: one primary decision per screen, no search form on home, no result grid.
- Truthful status labels only: `Reference price`, `Live fare verified`, `Rechecking live fare…`,
  `Booking requested`, `Awaiting confirmation`, `Sandbox ticket issued`, `Trip confirmed`.
- Before shipping: `npm run validate` then `npm run test:e2e`.
