import { NextResponse } from "next/server";
import { createAtlasAdapter, AtlasNotWiredError } from "@/lib/atlas";
import { getSession } from "@/lib/calendair/store";
import { scan } from "@/lib/calendair/flow";

type Ctx = { params: Promise<{ id: string }> };

/** FR-003 — read-only discovery. This is the one step allowed to run on its own. */
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  try {
    const result = await scan(session, createAtlasAdapter(session.scenario));
    return NextResponse.json({
      state: session.booking.state,
      searchInput: result.searchInput,
      recommended: result.recommended ?? null,
      alternates: result.alternates,
      rejected: result.rejected,
      scanned: result.scanned,
      constraintsActive: result.constraintsActive,
      activity: session.activity,
    });
  } catch (err) {
    const wired = err instanceof AtlasNotWiredError;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed", atlasNotWired: wired },
      { status: wired ? 501 : 502 },
    );
  }
}
