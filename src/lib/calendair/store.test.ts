import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Task 5 — the durable session store.
 *
 * These tests simulate an actual process restart, not just re-calling
 * functions: `vi.resetModules()` plus a fresh dynamic `import("./store")`
 * gives a brand-new module instance with its own top-level `sessions` Map,
 * exactly like a new Node process would have. The only thing carried across
 * that boundary is whatever `store1` wrote to `CALENDAIR_SESSION_STORE_PATH`
 * — precisely what a real restart would leave behind on disk.
 */

describe("durable session store — restart survives (task 5)", () => {
  let dir: string;
  let storePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "calendair-store-test-"));
    storePath = join(dir, "sessions.json");
    process.env.CALENDAIR_SESSION_STORE_PATH = storePath;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.CALENDAIR_SESSION_STORE_PATH;
    rmSync(dir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("a session written before a restart is readable by a freshly constructed store instance", async () => {
    const store1 = await import("./store");
    const session = store1.createSession("perfect");
    session.booking.state = "PRICE_CONFIRMED";
    session.booking.replans = 1;
    store1.saveSession(session);

    expect(existsSync(storePath)).toBe(true);

    // Simulate the restart: a brand-new module instance with no shared JS
    // state at all, reading only what's on disk.
    vi.resetModules();
    const store2 = await import("./store");
    const recovered = store2.getSession(session.id);

    expect(recovered).toBeDefined();
    expect(recovered?.id).toBe(session.id);
    expect(recovered?.booking.state).toBe("PRICE_CONFIRMED");
    expect(recovered?.booking.replans).toBe(1);
  });

  it("createSession persists immediately — a session survives a restart even before any later mutation", async () => {
    const store1 = await import("./store");
    const session = store1.createSession("perfect");

    vi.resetModules();
    const store2 = await import("./store");
    const recovered = store2.getSession(session.id);

    expect(recovered).toBeDefined();
    expect(recovered?.booking.state).toBe("WINDOW_DETECTED");
  });

  it("a session past its TTL on disk is not resurrected by the new instance", async () => {
    const store1 = await import("./store");
    const session = store1.createSession("perfect");
    store1.saveSession(session); // writes the real snapshot once

    // Now hand-edit the on-disk snapshot's touchedAt to 3h ago — simulating
    // a process that crashed 3 hours before this "restart", well past the
    // 2h TTL — without going through saveSession(), which would otherwise
    // stamp touchedAt back to "now" on every call.
    const { writeFileSync } = await import("node:fs");
    const onDisk = JSON.parse(readFileSync(storePath, "utf-8"));
    onDisk[0].touchedAt = Date.now() - 3 * 60 * 60 * 1000;
    writeFileSync(storePath, JSON.stringify(onDisk), "utf-8");

    vi.resetModules();
    const store2 = await import("./store");
    expect(store2.getSession(session.id)).toBeUndefined();
  });

  it("never persists a real document number to disk", async () => {
    const store1 = await import("./store");
    const session = store1.createSession("perfect");
    session.world.passenger.documentNumber = "E12345678";
    store1.saveSession(session);

    const raw = readFileSync(storePath, "utf-8");
    expect(raw).not.toContain("E12345678");
    // Deliberately NOT masked. A mask is fine for display, but this file is
    // read back into live session state and skill-adapter sends
    // passenger.documentNumber verbatim to `atlas-flight order create`, so a
    // masked value on disk would be submitted to the provider as if it were
    // real -- and session/route.ts masks again on the way out, so nobody would
    // see it. The field is withheld instead.
    expect(raw).not.toContain("••");
    expect(raw).toContain("__withheld__");
  });

  it("restores with an empty document and flags that it must be re-entered", async () => {
    const store1 = await import("./store");
    const session = store1.createSession("perfect");
    session.world.passenger.documentNumber = "E12345678";
    store1.saveSession(session);
    const id = session.id;

    vi.resetModules();
    const store2 = await import("./store");
    const restored = store2.getSession(id);
    expect(restored).toBeTruthy();
    expect(restored!.world.passenger.documentNumber).toBe("");
    expect(restored!.documentNeedsReentry).toBe(true);
  });

  it("a corrupt snapshot on disk does not crash startup — the new instance just starts empty", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(storePath, "{ this is not valid json", "utf-8");

    vi.resetModules();
    const store = await import("./store");
    expect(() => store.getSession("anything")).not.toThrow();
    expect(store.getSession("anything")).toBeUndefined();
  });

  it("a missing snapshot file (first-ever boot) does not crash startup", async () => {
    // storePath was never written in this test.
    vi.resetModules();
    const store = await import("./store");
    expect(() => store.createSession("perfect")).not.toThrow();
  });
});
