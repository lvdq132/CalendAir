"use client";

import { usePathname } from "next/navigation";
import { routeKey } from "@/lib/onboarding/routes";
import { useOnboarding } from "./OnboardingProvider";
import { WelcomeModal } from "./WelcomeModal";
import { TourLayer } from "./TourLayer";
import { GuideDrawer } from "./GuideDrawer";

/**
 * Every onboarding surface, mounted once at the root of the app.
 *
 * The current screen comes from the route, so the coach marks follow the
 * traveller through the flow without any screen having to opt in.
 */
export function OnboardingLayer() {
  const { ready } = useOnboarding();
  const pathname = usePathname();
  const screen = routeKey(pathname ?? "/");

  // Nothing renders until the browser store has been read, so a returning
  // traveller never sees the introduction flash past on hydration.
  if (!ready) return null;

  // The wizard is itself an introduction; a modal over the top of it would be one
  // introduction interrupting another.
  const onWizard = (pathname ?? "").startsWith("/onboarding");

  return (
    <>
      {!onWizard && <WelcomeModal />}
      {screen && <TourLayer screen={screen} />}
      <GuideDrawer />
    </>
  );
}
