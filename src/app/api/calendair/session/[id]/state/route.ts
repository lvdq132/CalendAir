import { NextResponse } from "next/server";
import { getSession } from "@/lib/calendair/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  return NextResponse.json({
    state: session.booking.state,
    booking: session.booking,
    activity: session.activity,
    engine: session.engine
      ? {
          recommended: session.engine.recommended ?? null,
          alternates: session.engine.alternates,
          rejected: session.engine.rejected,
          scanned: session.engine.scanned,
          constraintsActive: session.engine.constraintsActive,
          safeOffers: session.engine.safeOffers,
          idealMatches: session.engine.idealMatches,
          relaxedMatches: session.engine.relaxedMatches,
          searchInput: session.engine.searchInput,
        }
      : null,
    world: {
      taste: session.world.taste,
      window: session.world.window,
      companions: session.world.companions.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship })),
      busy: session.world.busy,
      nextCommitmentIso: session.world.nextCommitmentIso,
      profileSource: session.world.profileSource,
    },
  });
}
