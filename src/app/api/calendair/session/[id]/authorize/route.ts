import { NextResponse } from "next/server";
import { z } from "zod";
import { createAtlasAdapter } from "@/lib/atlas";
import { getSession, saveSession } from "@/lib/calendair/store";
import { authorize } from "@/lib/calendair/flow";

const Body = z.object({ tripId: z.string().min(1) });
type Ctx = { params: Promise<{ id: string }> };

/**
 * FR-007 / FR-008 — the human checkpoint, followed by a fresh read.
 * Nothing is written here. The response says what the world looks like now.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const outcome = await authorize(session, createAtlasAdapter(session.scenario), parsed.data.tripId);
  saveSession(session);
  return NextResponse.json({ outcome, state: session.booking.state, booking: session.booking, activity: session.activity });
}
