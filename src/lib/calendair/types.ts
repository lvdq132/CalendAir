/**
 * CALENDAIR domain types.
 *
 * The contracts in `STARTER_CONTRACTS/` are reproduced here verbatim where they
 * exist, and extended only where the product needs more. Nothing in this file
 * knows about Atlas transport details or about React.
 */

export type DemoScenario = "perfect" | "price-change" | "sold-out" | "pending";

export type DemoMode = "hybrid" | "visual" | "live";

export type SpontaneityLevel = "safe" | "curious" | "wild";

// ─── Calendar ────────────────────────────────────────────────────────────────

export interface CalendarWindow {
  id: string;
  startIso: string;
  endIso: string;
  originAirport: string;
  companionIds: string[];
  minUsefulHours: number;
  returnBufferMinutes: number;
}

/** A busy block. Titles are optional and never required by the matcher. */
export interface BusyBlock {
  id: string;
  startIso: string;
  endIso: string;
  /** Present only for the traveller's own calendar, never for a companion. */
  title?: string;
  /** True when this block was removed and is what opened the window. */
  released?: boolean;
}

export interface Companion {
  id: string;
  name: string;
  relationship: string;
  /** Free/busy only. Titles are deliberately absent from this shape. */
  busy: Array<Pick<BusyBlock, "id" | "startIso" | "endIso">>;
}

export interface DetectedWindow extends CalendarWindow {
  hours: number;
  /** Companion ids whose free/busy overlaps the whole window. */
  sharedWith: string[];
  /** Companion ids that were checked but conflict. */
  conflictedWith: string[];
  /** The event whose removal opened this window, when there was one. */
  openedBy?: { title: string; startIso: string; endIso: string };
  headline: string;
  subhead: string;
}

// ─── Travel taste ────────────────────────────────────────────────────────────

/**
 * The taste vocabulary, fixed and closed.
 *
 * A closed list is what lets destination affinity be computed rather than
 * guessed: every tag here also appears on destinations in the catalogue, so an
 * overlap is arithmetic instead of interpretation.
 */
export const TASTE_TAGS = [
  "Food",
  "Culture",
  "Nature",
  "Beach",
  "Adventure",
  "Wellness",
  "Nightlife",
  "History",
  "Family",
  "Events",
] as const;

export type TasteTag = (typeof TASTE_TAGS)[number];

/** How the traveller's availability is read. */
export type CalendarProvider = "demo" | "google";

export type NotificationLevel = "quiet" | "balanced" | "spontaneous";

export interface TravelTaste {
  travellerName: string;
  homeCity: string;
  originAirport: string;
  interests: string[];
  dreamDestinations: string[];
  maxSpontaneousSpend: number;
  currency: string;
  maxFlightMinutes: number;
  maxStops: number;
  redEyeTolerated: boolean;
  directPreferred: boolean;
  minUsefulHours: number;
  returnBufferMinutes: number;
  spontaneity: SpontaneityLevel;
}

// ─── Flights ─────────────────────────────────────────────────────────────────

export interface FlightSearchInput {
  origin: string;
  destination?: string;
  departureAfter: string;
  returnBefore: string;
  adults: number;
  cabin?: string;
  nonstopPreferred?: boolean;
}

export interface NormalizedOffer {
  id: string;
  origin: string;
  destination: string;
  outboundDepartureIso: string;
  outboundArrivalIso: string;
  returnDepartureIso?: string;
  returnArrivalIso?: string;
  totalPrice: number;
  currency: string;
  bookable: boolean;
  referenceOnly: boolean;
  stops: number;
  source: "ATLAS";
  /** Marketing carrier and number, when the provider supplies them. */
  outboundFlight?: string;
  returnFlight?: string;
  cabin?: string;
}

export interface VerifiedOffer extends NormalizedOffer {
  verifiedAtIso: string;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export type ScoreFactorId =
  | "calendarFit"
  | "usefulHours"
  | "budgetFit"
  | "fareValue"
  | "affinity"
  | "companion"
  | "convenience"
  | "returnSafety"
  | "friction";

export interface ScoreFactor {
  id: ScoreFactorId;
  label: string;
  /** Points awarded, already weighted. */
  points: number;
  /** Maximum this factor can contribute. Negative for penalties. */
  max: number;
  detail: string;
}

export interface ScoredTrip extends NormalizedOffer {
  usefulMinutes: number;
  escapeScore: number;
  reasons: string[];
  factors: ScoreFactor[];
  destinationName: string;
  destinationCountry: string;
  returnBufferMinutes: number;
  opportunityType: OpportunityType;
  dreamMatch?: number;
  promise: string;
  /** Optional Qwen-authored "why this fits" sentence. Language only; set lazily. */
  qwenExplanation?: string;
}

export type OpportunityType =
  | "unexpected-escape"
  | "shared-opening"
  | "dream-match"
  | "price-match"
  | "long-weekend"
  | "milestone-match"
  | "wildcard";

export interface RejectedCandidate {
  offerId: string;
  destinationName: string;
  /** The first hard rule that failed. */
  rule: string;
  detail: string;
}

// ─── Booking ─────────────────────────────────────────────────────────────────

/**
 * The booking state machine.
 *
 * SAFE_STOP means the search (or a replan) completed and genuinely nothing
 * qualified — a known fact. PROVIDER_UNAVAILABLE means the provider could not
 * be reached at all, even after retries, during a search or a reverification
 * — an unknown, not a "no". The two must never be collapsed into one state:
 * see AtlasProviderUnavailableError in src/lib/atlas/adapter.ts.
 */
export type BookingState =
  | "WINDOW_DETECTED"
  | "SEARCHING"
  | "CANDIDATES_FOUND"
  | "RECOMMENDATION_READY"
  | "USER_AUTHORIZED"
  | "REVERIFYING"
  | "PRICE_CONFIRMED"
  | "PRICE_CHANGED"
  | "BOOKING_CREATING"
  | "USER_CHECKPOINT"
  | "BOOKING_PENDING"
  | "FULFILMENT_CONFIRMED"
  | "CALENDAR_UPDATED"
  | "COMPLETE"
  | "OFFER_EXPIRED"
  | "SOLD_OUT"
  | "BOOKING_FAILED"
  | "SAFE_STOP"
  | "PROVIDER_UNAVAILABLE";

export interface PassengerProfile {
  id: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  nationality: string;
  documentType: string;
  documentNumber: string;
  issuingCountry: string;
  documentExpiry: string;
  /** True when this is fictional Sandbox rehearsal data. */
  fictional: boolean;
}

export interface BookingInput {
  offer: VerifiedOffer;
  passengerProfileId: string;
  /** Full profile, forwarded to live adapters that need it for passenger payload construction. */
  passenger?: PassengerProfile;
  approvedTotal: number;
  approvedCurrency: string;
}

export interface BookingResult {
  reference?: string;
  state: "pending" | "confirmed" | "failed";
  testMode: boolean;
  rawStatusLabel?: string;
  /** Present only once the provider actually returns ticketing detail. */
  ticketNumber?: string;
  pnr?: string;
}

// ─── Agent activity ──────────────────────────────────────────────────────────

export type ActivitySource = "CALENDAIR" | "ATLAS" | "CALENDAR" | "QWEN";

export interface AgentActivity {
  id: string;
  atIso: string;
  source: ActivitySource;
  title: string;
  /** Sanitised. Never contains event titles, tokens or document numbers. */
  detail: string;
  durationMs?: number;
  ok: boolean;
}

// ─── Provider status ─────────────────────────────────────────────────────────

export interface AtlasAccountStatus {
  authorized: boolean;
  ticketingAvailable: boolean;
  environment: "sandbox" | "production" | "unknown";
  /** Which adapter answered. Surfaced in the UI so the mode is never hidden. */
  adapter: "demo" | "skill" | "atrip" | "hybrid";
  /** Human-readable label shown on the demo badge. */
  label: string;
  /**
   * Per-capability provenance. A single `adapter` name is not honest enough
   * once a mode (hybrid) mixes a live capability with a demo one — this is
   * what lets the UI and /api/health say, precisely, which half of a
   * response is real. "unavailable" is for a selected-but-unwired adapter.
   */
  provenance: {
    search: "live" | "demo" | "unavailable";
    ticketing: "live" | "demo" | "unavailable";
  };
  /** Present only when ticketing is blocked by account entitlement, e.g. "TICKETING_ACTIVATION_REQUIRED". */
  ticketingBlockedReason?: string;
}
