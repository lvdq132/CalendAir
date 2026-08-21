import { NextResponse } from "next/server";
import { createAtlasAdapter } from "@/lib/atlas";

/**
 * Configuration health, without leaking any of it.
 *
 * Reports which provider adapter is live and whether credentials are present —
 * never the credentials themselves.
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
      credentialsPresent: Boolean(
        process.env.ATLAS_API_KEY || (process.env.ATLAS_CLIENT_ID && process.env.ATLAS_CLIENT_SECRET),
      ),
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
