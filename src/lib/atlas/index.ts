import { UnwiredAtlasAdapter, type AtlasAdapter } from "./adapter";
import { DemoAtlasAdapter } from "./demo-adapter";
import { SkillAtlasAdapter } from "./skill-adapter";
import { HybridAtlasAdapter } from "./hybrid-adapter";
import type { DemoScenario } from "@/lib/calendair/types";

export type { AtlasAdapter } from "./adapter";
export { AtlasNotWiredError, AtlasProviderUnavailableError } from "./adapter";
export { HybridAtlasAdapter } from "./hybrid-adapter";

/**
 * Choose an adapter from the environment.
 *
 * `ATLAS_INTEGRATION_MODE` is the switch. Leaving it unset selects deterministic
 * demo inventory, which is a legitimate choice for a stage demo — but the mode
 * is always reported, and the app never quietly downgrades a live configuration
 * to demo data when a call fails.
 *
 * Modes:
 *   (unset)  DemoAtlasAdapter — deterministic everything.
 *   skill    SkillAtlasAdapter — live atlas-flight CLI for every call. Ticketing
 *            is blocked for this account (TICKETING_ACTIVATION_REQUIRED), so
 *            verifyOffer and everything after it fails until activation completes.
 *   hybrid   HybridAtlasAdapter — live search, demo verify/booking/status. See
 *            hybrid-adapter.ts for the full rationale and its false-success guard.
 *            Unrelated to the DemoMode ("hybrid" | "visual" | "live") type in
 *            calendair/types.ts, which governs the calendar side, not Atlas.
 *   atrip    UnwiredAtlasAdapter placeholder — not implemented; fails loudly.
 */
const adapters = new Map<string, AtlasAdapter>();

export function createAtlasAdapter(scenario: DemoScenario = "perfect"): AtlasAdapter {
  const mode = (process.env.ATLAS_INTEGRATION_MODE ?? "").trim().toLowerCase();
  const env = (process.env.ATLAS_ENV ?? "sandbox").trim().toLowerCase();
  const environment = env === "production" ? "production" : env === "sandbox" ? "sandbox" : "unknown";

  // One adapter per configuration, kept alive across requests. A provider client
  // is long-lived in any real deployment, and the demo adapter needs the same
  // treatment: a booking reference has to still exist when the app asks what
  // happened to it a second later.
  const key = `${mode}|${environment}|${scenario}`;
  const existing = adapters.get(key);
  if (existing) return existing;

  const adapter: AtlasAdapter =
    mode === "skill"
      ? new SkillAtlasAdapter(environment)
      : mode === "hybrid"
        ? new HybridAtlasAdapter(environment, scenario)
        : mode === "atrip"
          ? new UnwiredAtlasAdapter(mode, environment) // ATRIP adapter not yet implemented
          : new DemoAtlasAdapter(scenario);
  adapters.set(key, adapter);
  return adapter;
}
