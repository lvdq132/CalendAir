/**
 * The destination catalogue.
 *
 * Photography comes from the design package's own imagery language; each entry
 * carries the timezone the useful-hours arithmetic needs, so no calculation ever
 * has to guess where a city is, and the taste tags the affinity factor counts
 * against, so a stated interest is scored rather than merely stored.
 */

import type { TasteTag } from "./types";

export interface Destination {
  iata: string;
  airportName: string;
  city: string;
  country: string;
  /** IANA zone. Used for every local-time calculation. */
  zone: string;
  photo: string;
  /** The emotional promise, shown under the city name. */
  promise: string;
  /** Typical nonstop block time from Shanghai/Beijing, in minutes. */
  flightMinutes: number;
  /** Indicative round-trip economy fare in CNY, before scenario adjustment. */
  baseFare: number;
  climate: string;
  /** What this place is actually good for. Counted against stated interests. */
  tags: TasteTag[];
}

export const DESTINATIONS: Destination[] = [
  {
    iata: "DXB",
    airportName: "Dubai International",
    city: "Dubai",
    country: "United Arab Emirates",
    zone: "Asia/Dubai",
    photo: "/destinations/dubai.jpg",
    promise: "Iconic luxury. Effortless moments.",
    flightMinutes: 555,
    baseFare: 6100,
    climate: "28–34°C · dry",
    tags: ["Food", "Beach", "Nightlife", "Wellness", "Events", "Family"],
  },
  {
    iata: "NRT",
    airportName: "Tokyo Narita",
    city: "Tokyo",
    country: "Japan",
    zone: "Asia/Tokyo",
    photo: "/destinations/tokyo.jpg",
    promise: "Neon evenings under a quiet mountain.",
    flightMinutes: 175,
    baseFare: 2380,
    climate: "19–26°C · clear",
    tags: ["Food", "Culture", "Nightlife", "History", "Events"],
  },
  {
    iata: "KIX",
    airportName: "Osaka Kansai",
    city: "Kyoto",
    country: "Japan",
    zone: "Asia/Tokyo",
    photo: "/destinations/kyoto.jpg",
    promise: "Old streets, early light, no hurry.",
    flightMinutes: 165,
    baseFare: 2480,
    climate: "18–24°C · mild",
    tags: ["Culture", "History", "Wellness", "Nature", "Food"],
  },
  {
    iata: "SIN",
    airportName: "Singapore Changi",
    city: "Singapore",
    country: "Singapore",
    zone: "Asia/Singapore",
    photo: "/destinations/singapore.jpg",
    promise: "A city that glows after dark.",
    flightMinutes: 330,
    baseFare: 3260,
    climate: "27–32°C · humid",
    tags: ["Food", "Culture", "Nightlife", "Family", "Events"],
  },
  {
    iata: "JFK",
    airportName: "John F. Kennedy Intl.",
    city: "New York City",
    country: "United States",
    zone: "America/New_York",
    photo: "/destinations/new-york.jpg",
    promise: "The city that never stops inspiring.",
    flightMinutes: 900,
    baseFare: 6789,
    climate: "16–23°C · bright",
    tags: ["Culture", "Food", "Nightlife", "Events", "History"],
  },
  {
    iata: "LIS",
    airportName: "Lisbon Portela",
    city: "Lisbon",
    country: "Portugal",
    zone: "Europe/Lisbon",
    photo: "/destinations/lisbon.jpg",
    promise: "Tiled hills and long yellow afternoons.",
    flightMinutes: 940,
    baseFare: 5240,
    climate: "20–27°C · sunny",
    tags: ["Food", "Culture", "History", "Beach", "Nightlife"],
  },
  {
    iata: "NAP",
    airportName: "Naples International",
    city: "Amalfi Coast",
    country: "Italy",
    zone: "Europe/Rome",
    photo: "/destinations/amalfi.jpg",
    promise: "Cliffs, lemon groves, and slow water.",
    flightMinutes: 880,
    baseFare: 5680,
    climate: "22–29°C · warm",
    tags: ["Beach", "Food", "Nature", "Wellness", "History"],
  },
  {
    iata: "KEF",
    airportName: "Reykjavík Keflavík",
    city: "Iceland",
    country: "Iceland",
    zone: "Atlantic/Reykjavik",
    photo: "/destinations/iceland.jpg",
    promise: "Green light over an empty road.",
    flightMinutes: 780,
    baseFare: 6420,
    climate: "6–12°C · cold",
    tags: ["Nature", "Adventure", "Wellness"],
  },
  {
    iata: "HAV",
    airportName: "José Martí Intl.",
    city: "Havana",
    country: "Cuba",
    zone: "America/Havana",
    photo: "/destinations/havana.jpg",
    promise: "Colour, brass, and warm evenings.",
    flightMinutes: 1180,
    baseFare: 7890,
    climate: "26–31°C · humid",
    tags: ["Culture", "History", "Nightlife", "Food", "Beach"],
  },
];

export const DESTINATION_BY_IATA: Record<string, Destination> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.iata, d]),
);

export interface OriginAirport {
  iata: string;
  airportName: string;
  city: string;
  country: string;
  zone: string;
}

export const ORIGINS: OriginAirport[] = [
  {
    iata: "PVG",
    airportName: "Shanghai Pudong",
    city: "Shanghai",
    country: "China",
    zone: "Asia/Shanghai",
  },
  {
    iata: "PEK",
    airportName: "Beijing Capital",
    city: "Beijing",
    country: "China",
    zone: "Asia/Shanghai",
  },
];

export const ORIGIN_BY_IATA: Record<string, OriginAirport> = Object.fromEntries(
  ORIGINS.map((o) => [o.iata, o]),
);
