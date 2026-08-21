/**
 * Qwen (Alibaba Cloud Model Studio) — language only.
 *
 * This is the one place a model touches CALENDAIR, and it touches nothing that
 * matters to a booking. It is handed numbers that are already decided and asked
 * to phrase them warmly; it can never change a price, a constraint, a score or a
 * booking state. Every guardrail here exists so a slow or absent model degrades
 * to the deterministic copy instead of breaking a demo.
 *
 * Uses the DashScope OpenAI-compatible endpoint, so no SDK is required.
 */

const ENDPOINT =
  process.env.QWEN_BASE_URL?.trim() ||
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

const TIMEOUT_MS = 3500;

export function qwenConfigured(): boolean {
  return Boolean(process.env.ALIBABA_CLOUD_MODEL_STUDIO_API_KEY && (process.env.QWEN_MODEL ?? "").trim());
}

export interface ExplainInput {
  travellerName: string;
  companionName?: string;
  destination: string;
  country: string;
  promise: string;
  windowHours: number;
  nights: number;
  days: number;
  price: string;
  returnBufferHours: number;
  onDreamList: boolean;
  interests: string[];
  /** The deterministic factor labels that actually earned the score. */
  strengths: string[];
}

/**
 * Produce a short, human "why this fits your life" paragraph.
 *
 * Returns `null` on any failure — no key, a timeout, a bad response — and the
 * caller shows the deterministic reasons instead. It never throws.
 */
export async function explainEscape(input: ExplainInput): Promise<string | null> {
  const apiKey = process.env.ALIBABA_CLOUD_MODEL_STUDIO_API_KEY?.trim();
  const model = (process.env.QWEN_MODEL ?? "").trim();
  if (!apiKey || !model) return null;

  const system =
    "You are CALENDAIR, a calm, precise travel concierge. Write one warm sentence (max 40 words) " +
    "explaining why a trip fits the traveller's life. Use ONLY the facts given. Never invent prices, " +
    "times or guarantees. No exclamation marks, no emoji, no lists. British English.";

  const facts = [
    `Traveller: ${input.travellerName}${input.companionName ? ` with ${input.companionName}` : ""}`,
    `Destination: ${input.destination}, ${input.country} — ${input.promise}`,
    `A ${input.windowHours}-hour opening became ${input.nights} nights, ${input.days} days there`,
    `Price ${input.price}, landing home ~${input.returnBufferHours}h before the next commitment`,
    input.onDreamList ? "It is on their dream list" : "It is a fresh discovery",
    `Interests: ${input.interests.join(", ")}`,
    `What earned it: ${input.strengths.join("; ")}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 90,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${facts}\n\nWrite the one sentence.` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    // A model that ignores the length cap does not get to run long on screen.
    const clean = text.replace(/\s+/g, " ").replace(/^["']|["']$/g, "");
    return clean.length > 240 ? clean.slice(0, 237).trimEnd() + "…" : clean;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
