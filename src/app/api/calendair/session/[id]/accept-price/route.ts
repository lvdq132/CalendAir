import { NextResponse } from "next/server";
import { getSession } from "@/lib/calendair/store";
import { acceptPrice } from "@/lib/calendair/flow";

type Ctx = { params: Promise<{ id: string }> };

/** An increase is never absorbed silently: it needs this explicit call. */
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  const outcome = acceptPrice(session);
  return NextResponse.json({ outcome, state: session.booking.state, booking: session.booking, activity: session.activity });
}
