import type { TourRoute } from "./routes";

/**
 * Everything the onboarding says.
 *
 * This is CALENDAIR's user guide, rewritten to be read inside the product
 * rather than beside it: a first-run introduction, coach marks anchored to the
 * thing they describe, a glossary for the words that carry the idea, and the
 * questions people actually ask — including the sceptical ones about whether
 * any of this is real.
 */

export type Side = "top" | "bottom" | "left" | "right";

// ─── First run ────────────────────────────────────────────────────────────────

export type WelcomePanel = {
  id: string;
  eyebrow: string;
  title: string;
  body: string[];
  art: "opening" | "privacy" | "checkpoint";
};

export const WELCOME: WelcomePanel[] = [
  {
    id: "trigger",
    eyebrow: "What this is",
    title: "Travel apps wait for you to search.",
    body: [
      "This one watches for when travel becomes possible. A Friday meeting is released, the gap it leaves runs to Monday morning, and that is where a trip begins.",
      "There is no destination box anywhere in this app. Where you go is the answer, not the question.",
    ],
    art: "opening",
  },
  {
    id: "privacy",
    eyebrow: "What it reads",
    title: "Availability, never content.",
    body: [
      "Free or busy — yours, and anyone you invite. CALENDAIR does not need to know what your meetings are about, and it never shows you what anyone else's are.",
      "That, your budget, and the places you said you dream about become a real flight search against live inventory. Not a chat about where you might like to go.",
    ],
    art: "privacy",
  },
  {
    id: "checkpoint",
    eyebrow: "What to trust",
    title: "The agent can be spontaneous. The transaction cannot.",
    body: [
      "Searching runs on its own. Everything after it waits for you. The live fare is re-read immediately before any booking, a price that moved stops the flow, and a trip is not called confirmed until the airline says so.",
      "Your calendar is written last, after that confirmation. This build runs against test inventory and takes no payment.",
    ],
    art: "checkpoint",
  },
];

// ─── Coach marks ──────────────────────────────────────────────────────────────

export type TourStep = {
  id: string;
  /** Matches a `data-tour` attribute in the app. */
  anchor: string;
  eyebrow: string;
  title: string;
  body: string;
  side?: Side;
  pad?: number;
};

export const TOUR: Record<TourRoute, TourStep[]> = {
  home: [
    {
      id: "opening",
      anchor: "home.opening",
      eyebrow: "Step 1",
      title: "This is the trigger",
      body: "Nothing was searched for. A commitment disappeared, and the agent decided the gap it left was long enough to be worth something.",
      side: "bottom",
    },
    {
      id: "calendar",
      anchor: "home.calendar",
      eyebrow: "Step 2",
      title: "Gold is open, grey is busy",
      body: "That is the entire signal. No titles, no attendees, no content — just whether each block is free, for you and for anyone you travel with.",
      side: "bottom",
    },
    {
      id: "hero",
      anchor: "home.hero",
      eyebrow: "Step 3",
      title: "One escape, not two hundred results",
      body: "Everything that failed a hard rule has already been dropped. What is left is the trip that fits your week best, with the three numbers that decided it.",
      side: "top",
    },
  ],
  calendar: [
    {
      id: "window",
      anchor: "calendar.window",
      eyebrow: "Step 1",
      title: "The window is measured, not guessed",
      body: "It starts when the released commitment did and ends when the next one begins. Everything downstream — flights, ground time, the return buffer — is arithmetic on these two instants.",
      side: "bottom",
    },
    {
      id: "companion",
      anchor: "calendar.companion",
      eyebrow: "Step 2",
      title: "Two calendars, no disclosure",
      body: "A shared opening needs both people free. CALENDAIR compares availability alone, which is why it can say yes without either of you seeing the other's week.",
      side: "bottom",
    },
    {
      id: "busy",
      anchor: "calendar.busy",
      eyebrow: "Step 3",
      title: "Your own week, for context",
      body: "Your titles appear because they are yours. Your companion's are absent by design, and the match works exactly as well without them.",
      side: "top",
    },
  ],
  opportunity: [
    {
      id: "status",
      anchor: "opportunity.status",
      eyebrow: "Step 1",
      title: "The status is a promise",
      body: "A reference price is comparison only and can never reach a booking. Live fare verified means the provider confirmed this exact total moments ago. The labels are never decorative.",
      side: "bottom",
    },
    {
      id: "numbers",
      anchor: "opportunity.numbers",
      eyebrow: "Step 2",
      title: "Time, not just money",
      body: "Useful time is hours on the ground after the airport is subtracted. Return buffer is how long you have between landing and your next commitment. Both are calculated in code, in the right timezone.",
      side: "bottom",
    },
    {
      id: "why",
      anchor: "opportunity.why",
      eyebrow: "Step 3",
      title: "The score opens up",
      body: "Nine factors, each with its own ceiling, adding to the number above. Nothing is hidden in a model's opinion — you can see exactly where this trip won and where it gave points away.",
      side: "top",
    },
    {
      id: "book",
      anchor: "opportunity.book",
      eyebrow: "Step 4",
      title: "This button is a checkpoint",
      body: "It does not book anything. It authorises the agent to go and re-read the live fare, and then come back to you with whatever it found.",
      side: "top",
    },
  ],
  booking: [
    {
      id: "steps",
      anchor: "booking.steps",
      eyebrow: "Step 1",
      title: "Read the world, then write",
      body: "Every consequential step is preceded by a fresh read. A fare that went stale during the two minutes you spent deciding fails here rather than at the airport.",
      side: "right",
    },
    {
      id: "decision",
      anchor: "booking.decision",
      eyebrow: "Step 2",
      title: "A difference is never absorbed",
      body: "If the price moved, the flow stops and shows you both totals. Accepting is a separate, explicit act — the agent has no authority to decide five hundred is close enough.",
      side: "top",
    },
  ],
  trip: [
    {
      id: "truth",
      anchor: "trip.truth",
      eyebrow: "Step 1",
      title: "Confirmed means confirmed",
      body: "A successful API response is not a journey. This screen only says confirmed once the provider returned its own confirmed state, and it says Sandbox when that is what it is.",
      side: "bottom",
    },
    {
      id: "calendar",
      anchor: "trip.calendar",
      eyebrow: "Step 2",
      title: "The calendar is written last",
      body: "Flights, the days away and a recovery buffer, added only after fulfilment. A confident block written before the airline agrees is how people miss real meetings.",
      side: "top",
    },
  ],
  activity: [
    {
      id: "stats",
      anchor: "activity.stats",
      eyebrow: "Step 1",
      title: "What the agent actually did",
      body: "The window it worked inside, how many itineraries it read, and how many hard rules were active while it did.",
      side: "bottom",
    },
    {
      id: "log",
      anchor: "activity.log",
      eyebrow: "Step 2",
      title: "Every step, sourced and timed",
      body: "Calendar, CALENDAIR, Atlas. Sanitised on purpose: no event titles, no tokens, no document numbers ever reach this log.",
      side: "bottom",
    },
    {
      id: "rejected",
      anchor: "activity.rejected",
      eyebrow: "Step 3",
      title: "The rejections are the proof",
      body: "A filter you never see work is a filter nobody believes. Each line names the rule that stopped it — including the cheapest fare on the list.",
      side: "top",
    },
  ],
};

export const TOUR_TOTAL = Object.values(TOUR).reduce((n, steps) => n + steps.length, 0);

// ─── Guide: how it works ──────────────────────────────────────────────────────

export type HowSection = {
  id: string;
  n: string;
  title: string;
  body: string;
  points?: string[];
};

export const HOW: HowSection[] = [
  {
    id: "window",
    n: "01",
    title: "A window is detected",
    body: "CALENDAIR reads permitted free/busy state and looks for a continuous opening above your minimum. It computes the usable start and end, and it does not need a single event title to do it.",
    points: [
      "The opening starts when the released commitment did.",
      "It ends when your next commitment begins, not at an arbitrary hour.",
    ],
  },
  {
    id: "companion",
    n: "02",
    title: "Companions are matched on availability",
    body: "Anyone who opts in contributes free/busy and nothing else. A window only counts as shared when both calendars are clear for its whole length.",
    points: ["Their event titles are never requested, stored or shown."],
  },
  {
    id: "search",
    n: "03",
    title: "The window becomes a flight search",
    body: "Origin, passenger count, the exact time bounds of the opening, your budget and your flight preferences. This is the only step that runs without asking you first, because reading inventory changes nothing.",
    points: ["Search is read-only.", "The results are real itineraries, not a synthetic list."],
  },
  {
    id: "filter",
    n: "04",
    title: "Hard constraints remove candidates outright",
    body: "Leaves too early, lands too late, too little return buffer, over budget, too little time on the ground, too long in the air, too many connections, companion not free, or a reference-only fare. Any one of these is fatal.",
    points: [
      "No score can overturn a failed hard rule.",
      "Each rejection names the rule that stopped it.",
    ],
  },
  {
    id: "score",
    n: "05",
    title: "What survives is scored",
    body: "Nine deterministic factors produce the Escape Score out of 100: calendar fit, useful hours, budget headroom, fare value, destination affinity, companion match, flight convenience, return safety, and friction penalties.",
    points: [
      "A model may phrase why a trip fits. It never moves these numbers.",
      "The factors are shown in full on the escape screen; they add to the score exactly.",
    ],
  },
  {
    id: "checkpoint",
    n: "06",
    title: "Then it stops and waits for you",
    body: "Booking, accepting a price increase, and confirming payment are each a separate human decision. Immediately before any write, the live fare and availability are re-read and compared with what you were shown.",
    points: [
      "If the price moved, you see both totals and decide.",
      "If the offer is gone, the agent replans at most twice, then stops and keeps watching.",
    ],
  },
  {
    id: "outcome",
    n: "07",
    title: "The outcome is asserted, not assumed",
    body: "A successful HTTP response is not a successful journey. CALENDAIR holds the state at Booking requested or Awaiting confirmation until the provider returns its own confirmed result.",
    points: ["Only then is the calendar written, with flights, the stay and a recovery buffer."],
  },
];

/** The Atlas layer, described as the traveller and the judges each need it. */
export const ATLAS_STEPS: { title: string; body: string }[] = [
  {
    title: "Where the flights come from",
    body: "Atlas provides the real routes, schedules and fares behind every candidate. It is the agent's action layer: without it, the calendar insight would have nothing to act on.",
  },
  {
    title: "The four capability groups",
    body: "Fare search is read-only discovery. Verify and book is the first write. Payment and ancillaries involve money. Post-booking changes an existing plan. Everything after the first group sits behind a human checkpoint in this app.",
  },
  {
    title: "Authorisation",
    body: "The integration is authorised once against an ATRIP account, and the permission scope is shown on the authorisation page. Passwords and login tokens are never shared with the skill or with this app.",
  },
  {
    title: "Sandbox rehearsal",
    body: "Sandbox uses test inventory and test prices. Switching environments changes the local configuration, so a new search is always started afterwards and an earlier offer is never reused.",
  },
  {
    title: "Reference price versus bookable",
    body: "An offer marked reference price is for comparison only. It cannot enter price verification or ticketing, and this app rejects it before it can reach a booking state.",
  },
  {
    title: "A Sandbox ticket is a test result",
    body: "The order number, PNR and ticket number returned in Sandbox are test results. They are not a real booking and no real payment method is charged. The interface says so wherever they appear.",
  },
];

// ─── Guide: glossary ──────────────────────────────────────────────────────────

export type GlossaryEntry = { id: string; term: string; short: string; long: string };

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "window",
    term: "Window",
    short: "A continuous opening in your calendar, long enough to travel in.",
    long: "Detected from free/busy state alone. It begins when the released commitment did and ends when your next one starts, and its two instants are what every later calculation is built on.",
  },
  {
    id: "freebusy",
    term: "Free/busy",
    short: "Whether a block is taken, without saying what it is.",
    long: "The only calendar signal CALENDAIR needs. It is also the only thing a companion ever shares, which is what makes matching two people's availability safe to do by default.",
  },
  {
    id: "shared",
    term: "Shared opening",
    short: "A window both calendars are clear for.",
    long: "Computed by comparing availability alone. If your companion has anything at all inside the window, it is not a shared opening, and no trip is proposed on the assumption that they will move it.",
  },
  {
    id: "useful",
    term: "Useful time",
    short: "Hours actually on the ground, after the airport.",
    long: "Measured from arrival to the return departure, less a fixed allowance at each end. Nights are counted on destination-local dates, so a red-eye that lands at six in the morning does not quietly gain a night.",
  },
  {
    id: "buffer",
    term: "Return buffer",
    short: "The gap between landing home and your next commitment.",
    long: "A hard constraint, not a preference. An itinerary that leaves less than the buffer you set is rejected outright, however well it scores on everything else.",
  },
  {
    id: "score",
    term: "Escape Score",
    short: "How well a trip fits your life, out of 100.",
    long: "Nine weighted factors: calendar fit, useful hours, budget headroom, fare value, destination affinity, companion match, flight convenience, return safety, and friction penalties. It measures suitability, not luxury.",
  },
  {
    id: "hard",
    term: "Hard constraint",
    short: "A pass/fail rule that no score can overturn.",
    long: "Budget ceiling, time bounds, return buffer, minimum ground time, flight length, connections, companion availability and offer status. Each is evaluated in ordinary code, because a model that rounds one of these produces a trip you cannot take.",
  },
  {
    id: "reference",
    term: "Reference price",
    short: "A comparison fare that cannot be booked.",
    long: "Some results are indicative only. They are useful for judging whether a real fare is good, and they are excluded from verification and booking before they can reach any state where money is involved.",
  },
  {
    id: "verified",
    term: "Live fare verified",
    short: "The provider confirmed this exact total moments ago.",
    long: "Set by a fresh read immediately before a write, never inferred from an earlier search. If the re-read disagrees with what you were shown, the flow stops rather than continuing on the old number.",
  },
  {
    id: "replan",
    term: "Bounded replanning",
    short: "At most two automatic replacements, then a stop.",
    long: "If an offer expires or sells out, the agent tries the next best candidate that still clears every hard constraint. After the limit it enters a safe stop and keeps watching rather than looping.",
  },
  {
    id: "safestop",
    term: "Safe stop",
    short: "The agent gives up rather than improvising.",
    long: "Reached when nothing clears the hard constraints or the replan budget runs out. Nothing is booked, nothing is written to your calendar, and the window stays open for a better opportunity.",
  },
  {
    id: "sandbox",
    term: "Sandbox",
    short: "A test environment with test inventory and test prices.",
    long: "A Sandbox order, PNR or ticket number is a test result. It is not a real booking and charges no real payment method. Anywhere one appears in this app, it is labelled as such.",
  },
  {
    id: "atlas",
    term: "Atlas",
    short: "The travel provider behind the search and the booking.",
    long: "Real routes, schedules and fares, plus verification and ticketing. It sits behind a single adapter interface, so the rest of the app never knows whether it is talking to the Skill or the API.",
  },
  {
    id: "dream",
    term: "Dream match",
    short: "The destination was already on your list.",
    long: "Destination affinity is one of the nine scoring factors, weighted by where a place sits on the list you set. It is a strong signal, not a licence to break a budget or a schedule.",
  },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((g) => [g.id, g]),
);

// ─── Guide: questions ─────────────────────────────────────────────────────────

export type Question = { id: string; q: string; a: string[] };

export const FAQ: Question[] = [
  {
    id: "no-search",
    q: "Why is there no search box?",
    a: [
      "Because naming a destination fixes the answer before anything is known about what is possible. The whole value here comes from being free to follow whichever real itinerary happens to fit the gap you actually have.",
      "If you already know where and when you want to go, an ordinary booking site will serve you better. This is for the weekend that quietly cleared and has not been spent yet.",
    ],
  },
  {
    id: "read-calendar",
    q: "Can it read what my meetings are about?",
    a: [
      "It asks for free/busy, which is a yes-or-no per block. Your own titles appear on your calendar screen because they are already yours; nothing about them is used in matching or sent anywhere for reasoning.",
      "A companion shares availability only. There is no view in this product, for anyone, that shows another person's event content.",
    ],
  },
  {
    id: "real-money",
    q: "Is any of this real money?",
    a: [
      "Not in this build. It runs against test inventory, and any order, PNR or ticket number you see is a Sandbox test result rather than a purchase.",
      "The structure around it is real in the way that matters: the same adapter interface, the same checkpoints, the same refusal to call something confirmed before the provider does.",
    ],
  },
  {
    id: "price-change",
    q: "What happens if the price changes while I am deciding?",
    a: [
      "The flow stops. You see the previous total, the new total and the difference, and nothing is booked until you explicitly accept the new amount or ask for something else.",
      "This is why the fare is re-read immediately before every write rather than trusted from the search a few minutes earlier.",
    ],
  },
  {
    id: "sold-out",
    q: "What if the flight sells out?",
    a: [
      "The agent tries the next best candidate that still clears every hard constraint, at most twice. Each replacement is a genuine re-evaluation, not a relaxation of your rules.",
      "After that it enters a safe stop: nothing booked, nothing written to your calendar, and the window left open.",
    ],
  },
  {
    id: "why-not-auto",
    q: "Why does it not just book it for me?",
    a: [
      "Search can be autonomous because reading inventory changes nothing. A booking is a commitment of your money and your weekend, and it is the point where a confident mistake becomes expensive.",
      "So the rule is fixed: the agent can be spontaneous, the transaction cannot.",
    ],
  },
  {
    id: "ai-prices",
    q: "Is a language model deciding the price?",
    a: [
      "No. Timezone arithmetic, budget limits, price comparison, hard-constraint decisions, booking state and fulfilment are all ordinary code, covered by tests.",
      "A model is useful for interpreting a stated preference or phrasing an explanation. Anywhere it could invent a number that becomes a promise, it is kept out.",
    ],
  },
  {
    id: "stack",
    q: "What are Atlas, Alibaba Cloud and Qoder doing here?",
    a: [
      "Atlas is the action layer: real routes, schedules, fares, verification and ticketing, behind a single adapter interface.",
      "Alibaba Cloud is the deployment target, with Qwen available for language-level explanation only. Qoder is the spec-driven, multi-agent workflow the repository itself is built with.",
    ],
  },
];

// ─── Guide: the screens ───────────────────────────────────────────────────────

export const STAGE_NOTES: Record<TourRoute, { title: string; body: string }> = {
  home: {
    title: "Home",
    body: "The opening, the week it sits in, and the single escape the agent decided was worth showing you.",
  },
  calendar: {
    title: "The window",
    body: "How long it is, why it exists, who else is free, and the commitments on either side of it.",
  },
  opportunity: {
    title: "The escape",
    body: "The itinerary in full: verified status, price, useful time, return buffer, and the score broken into its nine factors.",
  },
  booking: {
    title: "Checkpoints",
    body: "Reverification, any price change, the payment summary, and the honest pending state while ticketing completes.",
  },
  trip: {
    title: "Confirmed",
    body: "What was actually booked, what the provider returned, and the blocks written back to your calendar afterwards.",
  },
  activity: {
    title: "Agent activity",
    body: "Every step the agent took, timed and attributed — and every candidate it rejected, with the rule that stopped it.",
  },
};
