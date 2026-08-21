import { NextResponse } from "next/server";
import { createAtlasAdapter } from "@/lib/atlas";

/**
 * Configuration health, without leaking any of it.
 *
 * Reports which provider adapter is live and, per capability, whether that
 * capability is actually live, demo, or unavailable — never a single
 * blended "credentials present" flag. `atlas.getStatus()` already carries
 * `authorized`, `ticketingAvailable`, `provenance` (search/ticketing:
 * live|demo|unavailable) and `ticketingBlockedReason` (e.g.
 * "TICKETING_ACTIVATION_REQUIRED"); this route just forwards it.
 *
 * ATLAS_BASE_URL / ATLAS_CLIENT_ID / ATLAS_CLIENT_SECRET / ATLAS_API_KEY are
 * NOT read anywhere in src/lib/atlas — the atlas-flight CLI manages its own
 * auth outside this app. A previous version of this route derived a
 * `credentialsPresent` flag from those dead vars, which was misleading
 * (it could be true while the CLI was unauthenticated, or false while it
 * was authenticated). That flag is gone; `atlas.authorized` is the real
 * answer, straight from `atlas-flight auth status`.
 */
export async function GET() {
  const atlas = await createAtlasAdapter().getStatus();

  return NextResponse.json({
    ok: true,
    service: "calendair",
    time: new Date().toISOString(),
    demoMode: process.env.DEMO_MODE ?? "hybrid",
    demoScenario: process.env.DEMO_SCENARIO ?? "perfect",
    maxReplans: Number(process.env.MAX_REPLANS ?? 2),
    atlas: {
      ...atlas,
      integrationMode: process.env.ATLAS_INTEGRATION_MODE || "unset",
    },
    calendar: {
      googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      source: process.env.GOOGLE_CLIENT_ID ? "google" : "demo",
    },
    reasoning: {
      configured: Boolean(process.env.ALIBABA_CLOUD_MODEL_STUDIO_API_KEY && process.env.QWEN_MODEL),
      provider: "Alibaba Cloud Model Studio (Qwen)",
      model: process.env.QWEN_MODEL || "unset",
      note: "Used for explanation only. Never for pricing, constraints or booking state.",
    },
  });
}
