import type { DemoScenario, DetectedWindow, NormalizedOffer } from "../types";

/**
 * Deterministic flight inventory for the demo adapter.
 *
 * Every itinerary is expressed as an offset from the detected window, so the
 * schedule is always consistent with whatever Friday the demo runs on. The set
 * is deliberately mixed: three bookable options, and five that must be rejected
 * for five different reasons, because a filter you never see work is a filter
 * nobody believes.
 */

const MIN = 60_000;

interface Blueprint {
  id: string;
  destination: string;
  /** Minutes after the window opens that the outbound departs. */
  outMin: number;
  outBlock: number;
  /** Minutes after the window opens that the return departs. */
  backMin: number;
  backBlock: number;
  price: number;
  stops: number;
  cabin: string;
  outboundFlight: string;
  returnFlight: string;
  bookable?: boolean;
  referenceOnly?: boolean;
}

const BLUEPRINTS: Blueprint[] = [
  // ── Bookable ──────────────────────────────────────────────────────────────
  {
    id: "atl-dxb-nonstop",
    destination: "DXB",
    outMin: 160,
    outBlock: 555,
    backMin: 2940,
    backBlock: 535,
    price: 4980,
    stops: 0,
    cabin: "Economy",
    outboundFlight: "MU 243",
    returnFlight: "MU 244",
  },
  {
    id: "atl-nrt-nonstop",
    destination: "NRT",
    outMin: 1100,
    outBlock: 175,
    backMin: 2760,
    backBlock: 185,
    price: 2180,
    stops: 0,
    cabin: "Economy",
    outboundFlight: "MU 271",
    returnFlight: "MU 272",
  },
  {
    id: "atl-sin-nonstop",
    destination: "SIN",
    outMin: 330,
    outBlock: 330,
    backMin: 2820,
    backBlock: 340,
    price: 3260,
    stops: 0,
    cabin: "Economy",
    outboundFlight: "MU 545",
    returnFlight: "MU 546",
  },

  // ── Must be rejected, each for a different reason ─────────────────────────
  {
    // Cheapest-looking Dubai fare, but comparison only: it can never be booked.
    id: "atl-dxb-reference",
    destination: "DXB",
    outMin: 200,
    outBlock: 600,
    backMin: 2900,
    backBlock: 580,
    price: 4120,
    stops: 0,
    cabin: "Economy",
    outboundFlight: "EK 303",
    returnFlight: "EK 302",
    bookable: false,
    referenceOnly: true,
  },
  {
    id: "atl-nrt-business",
    destination: "NRT",
    outMin: 1100,
    outBlock: 175,
    backMin: 2760,
    backBlock: 185,
    price: 6900,
    stops: 0,
    cabin: "Business",
    outboundFlight: "MU 271",
    returnFlight: "MU 272",
  },
  {
    id: "atl-nrt-double-stop",
    destination: "NRT",
    outMin: 800,
    outBlock: 610,
    backMin: 2880,
    backBlock: 620,
    price: 1480,
    stops: 2,
    cabin: "Economy",
    outboundFlight: "9C 8583",
    returnFlight: "9C 8584",
  },
  {
    id: "atl-kix-onestop",
    destination: "KIX",
    outMin: 1180,
    outBlock: 300,
    backMin: 2700,
    backBlock: 290,
    price: 2480,
    stops: 1,
    cabin: "Economy",
    outboundFlight: "MU 731",
    returnFlight: "MU 732",
  },
  {
    id: "atl-jfk-nonstop",
    destination: "JFK",
    outMin: 240,
    outBlock: 900,
    backMin: 3240,
    backBlock: 960,
    price: 6789,
    stops: 0,
    cabin: "Premium Economy",
    outboundFlight: "MU 587",
    returnFlight: "MU 588",
  },
];

/** Scenario adjustments applied at search time, never invented per render. */
function priceFor(bp: Blueprint, scenario: DemoScenario): number {
  if (scenario === "price-change" && bp.id === "atl-dxb-nonstop") return bp.price;
  return bp.price;
}

export function demoOffers(window: DetectedWindow, scenario: DemoScenario): NormalizedOffer[] {
  const t0 = Date.parse(window.startIso);
  const iso = (min: number) => new Date(t0 + min * MIN).toISOString();

  return BLUEPRINTS.map((bp) => ({
      id: bp.id,
      origin: window.originAirport,
      destination: bp.destination,
      outboundDepartureIso: iso(bp.outMin),
      outboundArrivalIso: iso(bp.outMin + bp.outBlock),
      returnDepartureIso: iso(bp.backMin),
      returnArrivalIso: iso(bp.backMin + bp.backBlock),
      totalPrice: priceFor(bp, scenario),
      currency: "CNY",
      bookable: bp.bookable ?? true,
      referenceOnly: bp.referenceOnly ?? false,
      stops: bp.stops,
      source: "ATLAS" as const,
      outboundFlight: bp.outboundFlight,
      returnFlight: bp.returnFlight,
      cabin: bp.cabin,
  }));
}

/**
 * What the provider says when the offer is re-read immediately before a write.
 *
 * This is the only place a price is allowed to move, and it moves because the
 * scenario says the world moved — never because the UI needed something to show.
 */
export function demoReverification(
  offer: NormalizedOffer,
  scenario: DemoScenario,
): NormalizedOffer {
  if (scenario === "price-change" && offer.id === "atl-dxb-nonstop") {
    return { ...offer, totalPrice: offer.totalPrice + 500 };
  }
  // Only the leading fare disappears: the point of the scenario is to watch the
  // agent replan, not to make the whole market vanish.
  if (scenario === "sold-out" && offer.id === "atl-dxb-nonstop") {
    return { ...offer, bookable: false };
  }
  return offer;
}
