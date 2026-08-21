import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, activityEvent, pushActivity } from "@/lib/calendair/store";
import { tripById } from "@/lib/calendair/flow";
import { explainEscape, qwenConfigured } from "@/lib/llm/qwen";

const Body = z.object({ tripId: z.string().min(1) });
type Ctx = { params: Promise<{ id: string }> };

const money = (n: number, c: string) => `${c} ${Math.round(n).toLocaleString("en-US")}`;

/**
 * A language-only enrichment of "why this works".
 *
 * The screen already shows the deterministic reasons. This upgrades them with a
 * Qwen sentence when Model Studio is configured, and returns `source: "none"`
 * otherwise. It is deliberately off the booking path: nothing here can change a
 * price, a constraint or a state.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const trip = tripById(session, parsed.data.tripId);
  if (!trip) return NextResponse.json({ error: "Unknown trip" }, { status: 404 });

  if (!qwenConfigured()) {
    return NextResponse.json({ source: "none", explanation: null });
  }

  const companion = session.world.window.sharedWith.length > 0 ? session.world.companions[0]?.name : undefined;
  const nights = Math.max(1, Math.round(trip.usefulMinutes / (60 * 24)));

  const started = Date.now();
  const explanation = await explainEscape({
    travellerName: session.world.taste.travellerName,
    companionName: companion,
    destination: trip.destinationName,
    country: trip.destinationCountry,
    promise: trip.promise,
    windowHours: session.world.window.hours,
    nights,
    days: nights + 1,
    price: money(trip.totalPrice, trip.currency),
    returnBufferHours: Math.round(trip.returnBufferMinutes / 60),
    onDreamList: Boolean(trip.dreamMatch),
    interests: session.world.taste.interests,
    strengths: trip.factors
      .filter((f) => f.max > 0 && f.points >= f.max * 0.75)
      .map((f) => f.label.toLowerCase()),
  });

  if (explanation) {
    pushActivity(
      session,
      activityEvent(
        "QWEN",
        "Explained the match",
        `Qwen phrased why ${trip.destinationName} fits · language only, no numbers`,
        true,
        Date.now() - started,
      ),
    );
    // Persist so a page refresh keeps the wording without re-calling the model.
    trip.qwenExplanation = explanation;
  }

  return NextResponse.json({
    source: explanation ? "qwen" : "none",
    explanation,
    model: process.env.QWEN_MODEL ?? null,
  });
}
