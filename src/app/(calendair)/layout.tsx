import type { ReactNode } from "react";
import { SessionProvider } from "@/components/calendair/SessionProvider";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { OnboardingLayer } from "@/components/onboarding/OnboardingLayer";

/**
 * The app shell.
 *
 * Both providers live here rather than in a page, so client-side navigation
 * between screens keeps the run — and the onboarding — intact.
 */
export default function CalendairLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <OnboardingProvider>
        <div className="ca-app">{children}</div>
        <OnboardingLayer />
      </OnboardingProvider>
    </SessionProvider>
  );
}
