import { NextResponse } from "next/server";
import { createAtlasAdapter } from "@/lib/atlas";
import { getSession } from "@/lib/calendair/store";
import { pollFulfilment } from "@/lib/calendair/flow";

type Ctx = { params: Promise<{ id: string }> };

/** Ask the provider what actually happened. An HTTP 200 earlier proved nothing. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  const outcome = await pollFulfilment(session, createAtlasAdapter(session.scenario));
  return NextResponse.json({
    ...outcome,
    booking: session.booking,
    activity: session.activity,
  });
}
