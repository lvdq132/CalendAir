import { NextResponse } from "next/server";
import { createAtlasAdapter } from "@/lib/atlas";
import { getSession } from "@/lib/calendair/store";
import { book } from "@/lib/calendair/flow";

type Ctx = { params: Promise<{ id: string }> };

/** The first write. It only runs against a total the traveller approved. */
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  const outcome = await book(session, createAtlasAdapter(session.scenario));
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: 409 });

  return NextResponse.json({
    result: outcome.result,
    state: session.booking.state,
    booking: session.booking,
    activity: session.activity,
  });
}
