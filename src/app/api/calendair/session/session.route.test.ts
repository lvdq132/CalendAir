import { describe, expect, it } from "vitest";
import { POST as createSessionRoute } from "./route";
import { POST as scanRoute } from "./[id]/scan/route";
import { POST as authorizeRoute } from "./[id]/authorize/route";
import { POST as acceptPriceRoute } from "./[id]/accept-price/route";
import { POST as bookRoute } from "./[id]/book/route";
import { GET as fulfilmentRoute } from "./[id]/fulfilment/route";
import { GET as stateRoute } from "./[id]/state/route";
import { POST as explainRoute } from "./[id]/explain/route";

/**
 * Task 2 — resilience the e2e script does not drive: an unknown/expired
 * session id, and a malformed request body, must produce an honest 4xx JSON
 * response from every route, never an unhandled 500. Every [id] route reads
 * the session before doing anything else, so a bad id is the cheapest way to
 * exercise "the thing this call needed doesn't exist" uniformly.
 */
function jsonRequest(body?: unknown, raw?: string): Request {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const UNKNOWN_ID = "does-not-exist";

describe("unknown session id — every route answers 404, none throw", () => {
  it("scan", async () => {
    const res = await scanRoute(jsonRequest(), ctx(UNKNOWN_ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  it("authorize", async () => {
    const res = await authorizeRoute(jsonRequest({ tripId: "x" }), ctx(UNKNOWN_ID));
    expect(res.status).toBe(404);
  });

  it("accept-price", async () => {
    const res = await acceptPriceRoute(jsonRequest(), ctx(UNKNOWN_ID));
    expect(res.status).toBe(404);
  });

  it("book", async () => {
    const res = await bookRoute(jsonRequest(), ctx(UNKNOWN_ID));
    expect(res.status).toBe(404);
  });

  it("fulfilment", async () => {
    const res = await fulfilmentRoute(new Request("http://test.local/api"), ctx(UNKNOWN_ID));
    expect(res.status).toBe(404);
  });

  it("state", async () => {
    const res = await stateRoute(new Request("http://test.local/api"), ctx(UNKNOWN_ID));
    expect(res.status).toBe(404);
  });

  it("explain", async () => {
    const res = await explainRoute(jsonRequest({ tripId: "x" }), ctx(UNKNOWN_ID));
    expect(res.status).toBe(404);
  });
});

describe("malformed request bodies — 400, never a crash", () => {
  it("session creation degrades to defaults on unparseable JSON, rather than 500", async () => {
    const res = await createSessionRoute(jsonRequest(undefined, "{not json"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBeTruthy();
    expect(data.scenario).toBe("perfect"); // the documented default when nothing parseable arrived
  });

  it("authorize without a tripId is refused with 400, not 500", async () => {
    const created = await createSessionRoute(jsonRequest({ scenario: "perfect" }));
    const { sessionId } = await created.json();

    const missingField = await authorizeRoute(jsonRequest({}), ctx(sessionId));
    expect(missingField.status).toBe(400);

    const unparseable = await authorizeRoute(jsonRequest(undefined, "{not json"), ctx(sessionId));
    expect(unparseable.status).toBe(400);
  });

  it("explain without a tripId is refused with 400, not 500", async () => {
    const created = await createSessionRoute(jsonRequest({ scenario: "perfect" }));
    const { sessionId } = await created.json();

    const missingField = await explainRoute(jsonRequest({}), ctx(sessionId));
    expect(missingField.status).toBe(400);

    const unparseable = await explainRoute(jsonRequest(undefined, "{not json"), ctx(sessionId));
    expect(unparseable.status).toBe(400);
  });

  it("an unknown tripId at authorize is a safe stop, not a 500 or a fabricated trip", async () => {
    const created = await createSessionRoute(jsonRequest({ scenario: "perfect" }));
    const { sessionId } = await created.json();
    await scanRoute(jsonRequest(), ctx(sessionId));

    const res = await authorizeRoute(jsonRequest({ tripId: "trip-that-was-never-offered" }), ctx(sessionId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.outcome.kind).toBe("safe-stop");
  });
});
