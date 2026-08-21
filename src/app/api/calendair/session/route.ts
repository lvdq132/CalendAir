import { NextResponse } from "next/server";
import { z } from "zod";
import { createAtlasAdapter } from "@/lib/atlas";
import { createSession } from "@/lib/calendair/store";
import { sanitiseProfile } from "@/lib/calendair/profile";
import type { DemoScenario } from "@/lib/calendair/types";

const SCENARIOS: DemoScenario[] = ["perfect", "price-change", "sold-out", "pending"];

/**
 * The profile is shape-checked here and rebuilt in the domain.
 *
 * The schema is deliberately loose: its only job is to confirm an object arrived,
 * because `sanitiseProfile` re-derives every field from scratch and ignores
 * anything it does not recognise. Trusting a browser-supplied number as a hard
 * budget would make the hard budget decorative.
 */
const Body = z.object({
  scenario: z.string().optional(),
  profile: z.looseObject({}).optional(),
});

/** Start a run. The response always carries the provider mode, never hides it. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const body = parsed.success ? parsed.data : {};

  const requested = (body.scenario ?? process.env.DEMO_SCENARIO ?? "perfect") as DemoScenario;
  const scenario = SCENARIOS.includes(requested) ? requested : "perfect";

  // Only a finished profile is allowed to drive the engine; a half-completed
  // wizard must not quietly replace the traveller's real rules.
  const incoming = body.profile ? sanitiseProfile(body.profile) : null;
  const profile = incoming?.completedAt ? incoming : undefined;

  const session = createSession(scenario, new Date(), profile);
  const atlas = createAtlasAdapter(scenario);
  const status = await atlas.getStatus();

  return NextResponse.json({
    sessionId: session.id,
    scenario,
    demoMode: process.env.DEMO_MODE ?? "hybrid",
    atlas: status,
    world: {
      taste: session.world.taste,
      window: session.world.window,
      companions: session.world.companions.map((c) => ({
        id: c.id,
        name: c.name,
        relationship: c.relationship,
      })),
      busy: session.world.busy,
      nextCommitmentIso: session.world.nextCommitmentIso,
      profileSource: session.world.profileSource,
      passenger: { ...session.world.passenger, documentNumber: "••••••" + session.world.passenger.documentNumber.slice(-2) },
    },
    booking: session.booking,
  });
}
