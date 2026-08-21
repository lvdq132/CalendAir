/** The screens that carry coach marks, keyed off the pathname. */
export const TOUR_ROUTES = [
  "home",
  "calendar",
  "opportunity",
  "booking",
  "trip",
  "activity",
] as const;

export type TourRoute = (typeof TOUR_ROUTES)[number];

export function routeKey(pathname: string): TourRoute | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/opportunity")) return "opportunity";
  if (pathname.startsWith("/booking")) return "booking";
  if (pathname.startsWith("/trip")) return "trip";
  if (pathname.startsWith("/activity")) return "activity";
  return null;
}

export const ROUTE_LABEL: Record<TourRoute, string> = {
  home: "Home",
  calendar: "The window",
  opportunity: "The escape",
  booking: "Checkpoints",
  trip: "Confirmed",
  activity: "Agent activity",
};
