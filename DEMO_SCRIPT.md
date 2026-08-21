# CALENDAIR — three-minute demo script

Run `npm run demo`, open `http://localhost:3000`, and reset at `/demo` before each take.
The onboarding introduction appears on a first run; press **Skip** for the judged recording, or use
**Replay the introduction** at `/demo` if you want it in shot.

The judged run uses the **prepared demo traveller**, so nothing depends on completing the wizard on
camera. If a profile was set up on this browser, `/settings` will say “Your profile” — use *Forget my
profile and use the prepared traveller* to get the numbers below back. `/onboarding` is worth thirty
seconds of its own if there is room: it is where the hard rules in this script come from.

### The deterministic path is the judged one, on purpose

This script runs entirely on deterministic demo data (`ATLAS_INTEGRATION_MODE` unset) — reliable on
stage beats impressive-but-flaky, and every screen already says so (the mode badge, `/demo`,
`/api/health`). **Do not run the judged recording against live Atlas search.**

To show live Atlas search separately — as a technical proof, not as the main run — set
`ATLAS_INTEGRATION_MODE=hybrid` in `.env.local` (needs `atlas-flight auth login` once on the host)
and restart. The badge changes to `Atlas Hybrid · live search, demo ticketing`, and the home screen's
searching card says "Searching live inventory" instead of "Searching the prepared inventory" — same
screens, honestly relabelled for what is actually running. Say plainly if asked: **live search has
been observed to fail roughly one call in three**, even with the app's built-in retries, which is
exactly why the scripted run above stays on the deterministic path.

---

## 0:00–0:15 · The trigger

Open on the home screen.

> "Travel apps wait for you to search. CALENDAIR watches for when travel becomes possible."

Point at **68 hours opened**, and at the released Friday commitment underneath it.

> "A meeting disappeared. Nobody searched for anything."

## 0:15–0:35 · Life and people become constraints

> "Shanghai Pudong. Sophie is free too — matched on availability alone, so neither of us has to see
> what the other's week is actually about."

Tap **View calendar** if there is time: the window, the overlap, the privacy note.

## 0:35–0:55 · The real action layer

Tap the bell, or **Agent activity**.

> "The agent read eight itineraries against nine hard rules. Every step is timed and attributed."

Scroll to **Rejected**.

> "Five were dropped, each by a named rule. The cheapest Dubai fare was a reference price, so it can
> never reach a booking. A business fare broke the budget ceiling. Kyoto did not leave enough time on
> the ground. New York lands two hours after Monday starts."

## 0:55–1:20 · The desire moment

Back to home, then **Explore escape**.

> "Dubai. Escape Score 91. Not the cheapest fare — the best use of the time."

Point at the three numbers: price, two nights and three days on the ground, ten hours of buffer
before Monday. Open **How the 91 was reached**.

> "Nine factors, adding to the number above. Nothing is hidden inside a model's opinion."

## 1:20–1:45 · The first checkpoint

Tap **Book escape**.

> "That did not book anything. It authorised the agent to go and re-read the live fare."

Point at the checkpoint list.

> "Search can be autonomous. The first write cannot."

## 1:45–2:05 · Show the trust

*(For the judged cut, run the `price-change` scenario from `/demo`.)*

> "The world moved while we were deciding. CNY 4,980 became 5,480."

Point at both totals and the two buttons.

> "The agent has no authority to absorb five hundred yuan on somebody's behalf. Accepting is a
> separate act."

Tap **Accept new price**, then **Confirm this exact payment**.

## 2:05–2:25 · Fulfilment truth

> "And we do not call an HTTP response a journey. It stays at 'booking requested' until the provider
> returns its own confirmed state."

On the trip screen, point at **What the provider returned** and the Sandbox label.

> "Order, PNR and ticket, shown verbatim. This is a Sandbox test result, and the interface says so."

## 2:25–2:43 · The calendar transforms

On `/trip`, point at the calendar card — it now reads **"The blocks CALENDAIR would write."**

> "Before: sixty-eight hours free. After: the outbound flight, the days in Dubai, the return, and a
> recovery buffer — generated only after confirmation, and held in this session. There is no Google
> Calendar connection in this build, and the card says so rather than claiming one."

If a judge's eye catches the wording, that is the point, not a gap to smooth over — say it plainly:
onboarding offers Google Calendar as a real option, states it needs a one-time authorisation that
has not happened, and every calendar screen — this one included — says the same thing.

## 2:43–2:55 · Technical proof

Show `/activity` once more, or the architecture in the README.

> "Calendar, opportunity engine, Atlas, human checkpoint, confirmation, calendar. Bounded to two
> replans. A fresh read before every write. And an outcome asserted, not assumed."

## 2:55–3:00 · Close

> "Your free time just became Dubai."
>
> **CALENDAIR. The trip finds you.**

Small: powered by Atlas × Alibaba Cloud.

---

## If a judge asks

**What is this?** An agent that turns calendar availability into travel demand before the traveller
searches, and then moves it safely to a verified booking.

**What is not autonomous?** Anything that costs money or changes a plan. Booking, accepting a price
increase, taking a replacement trip, and confirming payment are each a separate human decision.

**Is the AI setting prices?** No. Timezone arithmetic, budgets, comparisons, constraint decisions and
booking state are ordinary code with tests. A model is only used for wording.

**What happens if it goes wrong?** Two bounded replans, each re-evaluated against the same hard
rules, and then a safe stop with nothing booked and the window left open.

**What if Atlas itself doesn't answer?** That is a different fact from "no flights," and the app
never blurs the two. A provider outage reaches `PROVIDER_UNAVAILABLE` — retried a few times first,
then reported as "we couldn't reach the provider," not as an empty market.

**Is any of this connected to my real calendar or a real booking?** No. The calendar is CALENDAIR's
deterministic prepared world — no Google OAuth exists in this build, and onboarding, `/calendar` and
`/trip` all say so. Bookings run against Atlas's sandbox; every reference, PNR and ticket is labelled
a test result and shown verbatim, never upgraded to "confirmed" on the provider's behalf.
