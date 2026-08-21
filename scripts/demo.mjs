#!/usr/bin/env node
/**
 * Start CALENDAIR for a demo, and say out loud what it is running against.
 *
 * The one thing this script must never do is let somebody present demo
 * inventory as live Atlas data by accident, so the mode is printed before the
 * server starts and the app repeats it on screen.
 */
import { spawn } from "node:child_process";

const env = { ...process.env };
env.DEMO_MODE ??= "hybrid";
env.DEMO_SCENARIO ??= "perfect";
env.MAX_REPLANS ??= "2";
env.ATLAS_ENV ??= "sandbox";

const port = env.PORT ?? "3000";
const mode = (env.ATLAS_INTEGRATION_MODE ?? "").trim().toLowerCase();
const provider =
  mode === "skill" || mode === "atrip"
    ? `Atlas ${mode.toUpperCase()} selected — the adapter must be implemented from the ` +
      `installed Skill or the ATRIP interface. Search will fail loudly rather than fall back.`
    : "Deterministic demo inventory — NOT live Atlas data.";

const line = "─".repeat(64);
console.log(`\n${line}`);
console.log("  CALENDAIR — your time, perfected.");
console.log(line);
console.log(`  URL              http://localhost:${port}`);
console.log(`  Demo mode        ${env.DEMO_MODE}`);
console.log(`  Scenario         ${env.DEMO_SCENARIO}  (switch at /demo)`);
console.log(`  Max replans      ${env.MAX_REPLANS}`);
console.log(`  Atlas env        ${env.ATLAS_ENV}`);
console.log(`  Provider         ${provider}`);
if (env.DEMO_MODE === "visual") {
  console.log("  ⚠  visual mode is for UI rehearsal only and cannot be presented as Atlas data.");
}
console.log(`${line}\n`);

const child = spawn("npx", ["next", "dev", "-p", port], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
