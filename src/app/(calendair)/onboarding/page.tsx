"use client";

import { Screen } from "@/components/calendair/Screen";
import { Wizard } from "@/components/onboarding/Wizard";

/**
 * `/onboarding` — the traveller profile.
 *
 * Inside the app shell, so the wizard is the same column, wordmark and provenance
 * as every other screen rather than a separate world with its own rules.
 */
export default function OnboardingScreen() {
  return (
    <Screen back="/">
      <Wizard />
    </Screen>
  );
}
