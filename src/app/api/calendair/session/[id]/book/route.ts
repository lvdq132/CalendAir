import { NextResponse } from "next/server";
import { createAtlasAdapter } from "@/lib/atlas";
import { getSession, saveSession } from "@/lib/calendair/store";
import { book } from "@/lib/calendair/flow";

type Ctx = { params: Promise<{ id: string }> };

/** The first write. It only runs against a total the traveller approved. */
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  const outcome = await book(session, createAtlasAdapter(session.scenario));
  saveSession(session);
  if (!outcome.ok) {
    // The failure reason travels with the session's own state (BOOKING_FAILED
    // or, when the outcome is genuinely unknown, BOOKING_OUTCOME_UNKNOWN — see
    // flow.ts's book()) so the client can render the real checkpoint instead
    // of being left showing whatever screen it was on when the request went out.
    return NextResponse.json(
      { error: outcome.reason, state: session.booking.state, booking: session.booking, activity: session.activity },
      { status: 409 },
    );
  }

  return NextResponse.json({
    result: outcome.result,
    state: session.booking.state,
    booking: session.booking,
    activity: session.activity,
  });
}
