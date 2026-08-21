import { NextResponse } from "next/server";
import { createAtlasAdapter } from "@/lib/atlas";
import { checkAtlasCliOnHost } from "@/lib/atlas/skill-adapter";

/**
 * Configuration health, without leaking any of it.
 *
 * Reports which provider adapter is live and, per capability, whether that
 * capability is actually live, demo, or unavailable — never a single
 * blended "credentials present" flag. `atlas.getStatus()` already carries
 * `authorized`, `ticketingAvailable`, `provenance` (search/ticketing:
 * live|demo|unavailable) and `ticketingBlockedReason` (e.g.
 * "TICKETING_ACTIVATION_REQUIRED"); this route just forwards it.
 *
 * ATLAS_BASE_URL / ATLAS_CLIENT_ID / ATLAS_CLIENT_SECRET / ATLAS_API_KEY are
 * NOT read anywhere in src/lib/atlas — the atlas-flight CLI manages its own
 * auth outside this app. A previous version of this route derived a
 * `credentialsPresent` flag from those dead vars, which was misleading
 * (it could be true while the CLI was unauthenticated, or false while it
 * was authenticated). That flag is gone; `atlas.authorized` is the real
 * answer, straight from `atlas-flight auth status`.
 *
 * `atlas.host` (task 3) is a second, independent truth: whether the
 * `atlas-flight` binary actually runs and is authorized on THIS host, right
 * now — checked directly, regardless of `ATLAS_INTEGRATION_MODE`. The Atlas
 * integration is a local CLI subprocess whose credential lives in this
 * host's OS keyring, established through an interactive browser login —
 * there is no API key, no file to mount, and no headless auth mode (see
 * README's "Atlas cannot run in a deployed runtime" and the official Skill
 * contract, which requires operating through the CLI only). A deployed
 * instance with the env var set but no CLI installed, or a CLI nobody has
 * ever authorized on that specific host, must show that plainly here rather
 * than appearing configured because a mode string was set.
 */
export async function GET() {
  const atlas = await createAtlasAdapter().getStatus();
  const atlasHost = checkAtlasCliOnHost();

  return NextResponse.json({
    ok: true,
    service: "calendair",
    time: new Date().toISOString(),
    demoMode: process.env.DEMO_MODE ?? "hybrid",
    demoScenario: process.env.DEMO_SCENARIO ?? "perfect",
    maxReplans: Number(process.env.MAX_REPLANS ?? 2),
    atlas: {
      ...atlas,
      integrationMode: process.env.ATLAS_INTEGRATION_MODE || "unset",
      // Ground truth about the running host, not the selected mode — see
      // checkAtlasCliOnHost()'s doc comment. `authorized` above (from
      // atlas.getStatus()) only actually calls the CLI when a live adapter
      // is configured; this runs the check unconditionally.
      host: {
        ...atlasHost,
        deployable: false,
        constraint:
          "Atlas is a local CLI subprocess (atlas-flight), authorized via an interactive " +
          "browser login, with its credential stored in this host's OS keyring (macOS " +
          "Keychain via Python `keyring`). There is no API key, no credential file to " +
          "mount, and no headless auth mode, and the official Skill contract requires " +
          "operating through this CLI only — never calling a service directly. This means " +
          "the Atlas integration cannot work in any stateless or ephemeral deployed " +
          "runtime: it only works on a host where `atlas-flight auth login` has been " +
          "completed interactively and the resulting credential persists in that host's " +
          "keyring between requests.",
      },
    },
    calendar: {
      // No Google OAuth callback route exists anywhere in this build (see
      // AGENT_HANDOFF.md) — GOOGLE_CLIENT_ID/SECRET being present would not
      // connect anything, so `source` must never flip to "google" on their
      // presence alone. That is exactly the kind of blended claim this route
      // exists to prevent (see the comment above about `credentialsPresent`).
      googleClientConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      oauthImplemented: false,
      source: "demo",
    },
    reasoning: {
      configured: Boolean(process.env.ALIBABA_CLOUD_MODEL_STUDIO_API_KEY && process.env.QWEN_MODEL),
      provider: "Alibaba Cloud Model Studio (Qwen)",
      model: process.env.QWEN_MODEL || "unset",
      note: "Used for explanation only. Never for pricing, constraints or booking state.",
    },
  });
}
