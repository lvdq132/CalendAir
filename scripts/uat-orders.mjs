/**
 * Creates two sandbox orders for ATRIP UAT Testing.
 *
 * Case 1: 1 Adult · Oneway · Connection  — 6E AMS→MAA
 * Case 2: 2 Adults + 1 Child · Roundtrip · Direct — FA DUR→CPT
 *
 * Reads ATLAS_CLIENT_ID and ATLAS_CLIENT_SECRET from .env.local.
 * Uses public sandbox test cards — no real money, no real tickets.
 */

import { createReadStream } from "node:fs";
import { readFileSync } from "node:fs";
import { request } from "node:https";
import { gunzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
const envText = readFileSync(envPath, "utf8");
const CLIENT_ID = envText.match(/^ATLAS_CLIENT_ID=(.+)$/m)?.[1]?.trim() ?? "";
const CLIENT_SECRET = envText.match(/^ATLAS_CLIENT_SECRET=(.+)$/m)?.[1]?.trim() ?? "";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("ATLAS_CLIENT_ID or ATLAS_CLIENT_SECRET missing in .env.local");
  process.exit(1);
}

const HOST = "sandbox.atriptech.com";
const HEADERS = {
  "Content-Type": "application/json",
  "Accept": "*/*",
  "Accept-Encoding": "gzip",
  "x-atlas-client-id": CLIENT_ID,
  "x-atlas-client-secret": CLIENT_SECRET,
};

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: HOST, path, method: "POST",
      headers: { ...HEADERS, "Content-Length": Buffer.byteLength(payload) },
    };
    const req = request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        if (res.headers["content-encoding"] === "gzip") {
          try { buf = gunzipSync(buf); } catch (_) {}
        }
        try { resolve(JSON.parse(buf.toString("utf8"))); }
        catch (e) { reject(new Error(`JSON parse failed: ${buf.toString("utf8").slice(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Fictional sandbox passenger data ────────────────────────────────────────
// These are test-only identifiers — never real travel documents.

const PAX_ADULT_1 = {
  name: "SMITH/JOHN", passengerType: 0, gender: "M",
  birthday: "19850115", cardType: "PP", cardNum: "PA000001",
  cardIssuePlace: "US", cardExpired: "20300101", nationality: "US",
};
const PAX_ADULT_2 = {
  name: "SMITH/JANE", passengerType: 0, gender: "F",
  birthday: "19880320", cardType: "PP", cardNum: "PB000002",
  cardIssuePlace: "US", cardExpired: "20300101", nationality: "US",
};
const PAX_CHILD_1 = {
  name: "SMITH/TOMMY", passengerType: 1, gender: "M",
  birthday: "20180610", cardType: "PP", cardNum: "PC000003",
  cardIssuePlace: "US", cardExpired: "20300101", nationality: "US",
};
const CONTACT = {
  name: "SMITH/JOHN", email: "sandbox@test.invalid", mobile: "0001-55555555",
};

// VCC passthrough test card (public sandbox data)
const TEST_CARD = {
  cardType: "Visa",
  cardNumber: "4532015112830366",
  cardExpireMonth: "12",
  cardExpireYear: "2028",
  cvv: "123",
  firstName: "SANDBOX",
  lastName: "TEST",
};

// ─── Booking flow ─────────────────────────────────────────────────────────────

async function searchFirstRouting(searchBody) {
  console.log(`  [search] ${searchBody.fromCity}→${searchBody.toCity} tripType=${searchBody.tripType} adults=${searchBody.adultNum} children=${searchBody.childNum ?? 0}`);
  const res = await post("/search.do", searchBody);
  if (res.status !== 0) throw new Error(`search.do failed: status=${res.status} msg=${res.msg}`);
  const routings = res.routings ?? [];
  if (!routings.length) throw new Error("search.do returned zero routings");

  // Prefer routings that support deposit (1) or VCC passthrough (3)
  const routing = routings.find(r => (r.supportPaymentMethods ?? []).includes(1))
    ?? routings.find(r => (r.supportPaymentMethods ?? []).includes(3))
    ?? routings[0];

  const payMethods = routing.supportPaymentMethods ?? [];
  const price = (routing.adultPrice ?? 0) + (routing.adultTax ?? 0);
  console.log(`  [search] ✓ got ${routings.length} routings, using first · ${routing.currency} adult=${price} · payMethods=${payMethods}`);
  return routing;
}

async function verify(routingIdentifier) {
  console.log(`  [verify] routingIdentifier=${routingIdentifier.slice(0, 30)}...`);
  const res = await post("/verify.do", { routingIdentifier, maxResponseTime: 15000 });
  if (res.status !== 0) throw new Error(`verify.do failed: status=${res.status} msg=${res.msg}`);
  const routing = res.routing;
  const adult = (routing.adultPrice ?? 0) + (routing.adultTax ?? 0);
  const child = (routing.childPrice ?? 0) + (routing.childTax ?? 0);
  console.log(`  [verify] ✓ sessionId=${res.sessionId.slice(0, 20)}... adult=${adult} child=${child} ${routing.currency}`);
  return { sessionId: res.sessionId, routing };
}

async function createOrder(sessionId, passengers, contact, paymentMethod) {
  console.log(`  [order] sessionId=${sessionId.slice(0, 20)}... passengers=${passengers.length}`);
  const body = { sessionId, passengers, contact };
  if (paymentMethod === 5) body.payment = { cardType: "Visa" }; // MoR only
  const res = await post("/order.do", body);
  if (res.status !== 0) throw new Error(`order.do failed: status=${res.status} msg=${res.msg}`);
  console.log(`  [order] ✓ orderNo=${res.orderNo}`);
  return res.orderNo;
}

async function pay(orderNo, paymentMethods) {
  // Prefer deposit (1) → VCC passthrough (3)
  const method = paymentMethods.includes(1) ? 1 : paymentMethods.includes(3) ? 3 : 1;
  console.log(`  [pay] orderNo=${orderNo} method=${method}${method === 3 ? " (VCC test card)" : " (deposit)"}`);
  const body = { orderNo, paymentMethod: method };
  if (method === 3) body.creditCard = TEST_CARD;
  const res = await post("/pay.do", body);
  if (res.status !== 0) throw new Error(`pay.do failed: status=${res.status} msg=${res.msg}`);
  console.log(`  [pay] ✓ status=${res.status}`);
  return { method };
}

async function pollForPnr(orderNo, maxAttempts = 20, intervalMs = 8000) {
  console.log(`  [poll] waiting for PNR on orderNo=${orderNo}...`);
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    const res = await post("/queryOrderDetails.do", { orderNo });
    if (res.status !== 0) {
      console.log(`  [poll] queryOrderDetails status=${res.status}, retrying...`);
      continue;
    }
    const order = res.data ?? res;
    // Inspect for PNR at various response paths
    const pnr = order.pnrCode
      ?? order.airlineBookings?.[0]?.paxFaresInfo?.[0]?.pnrCode
      ?? order.airlineBookings?.[0]?.pnrCode
      ?? "";
    const tktState = order.orderStatus ?? order.ticketingStatus ?? "";
    console.log(`  [poll] attempt ${i + 1}: orderStatus=${tktState} pnr=${pnr || "(none yet)"}`);
    if (pnr) return pnr;
    // Also check if order is ticketed (might use different field)
    if (tktState === "TICKETED" || tktState === "2") {
      const fallbackPnr = order.pnrCode ?? "SANDBOX";
      console.log(`  [poll] ticketed, pnr=${fallbackPnr}`);
      return fallbackPnr;
    }
  }
  console.log(`  [poll] PNR not obtained within polling window — order may still be processing`);
  return "(pending)";
}

// ─── Run both cases ───────────────────────────────────────────────────────────

async function runCase(label, searchBody, passengers) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`CASE: ${label}`);
  console.log("=".repeat(60));
  try {
    const routing = await searchFirstRouting(searchBody);
    const payMethods = routing.supportPaymentMethods ?? [1];

    const { sessionId } = await verify(routing.routingIdentifier);
    const orderNo = await createOrder(sessionId, passengers, CONTACT, payMethods[0]);
    await pay(orderNo, payMethods);
    const pnr = await pollForPnr(orderNo);

    // Total fare for form
    const adultTotal = ((routing.adultPrice ?? 0) + (routing.adultTax ?? 0)) * (searchBody.adultNum ?? 1);
    const childTotal = ((routing.childPrice ?? 0) + (routing.childTax ?? 0)) * (searchBody.childNum ?? 0);
    const total = (adultTotal + childTotal).toFixed(2);

    console.log(`\n  ✅ RESULT for "${label}":`);
    console.log(`     Sandbox Order No : ${orderNo}`);
    console.log(`     Airline PNR      : ${pnr}`);
    console.log(`     Expected Fare    : ${total}`);
    console.log(`     Currency         : ${routing.currency}`);
    return { orderNo, pnr, fare: total, currency: routing.currency };
  } catch (err) {
    console.error(`\n  ❌ FAILED: ${err.message}`);
    return null;
  }
}

async function main() {
  // Case 1: 1 Adult · Oneway · Connection — 6E AMS→MAA
  const case1 = await runCase(
    "1 Adult · Oneway · Connection (6E AMS→MAA)",
    {
      tripType: "1", adultNum: 1, childNum: 0, infantNum: 0,
      fromCity: "AMS", toCity: "MAA",
      fromDate: "20260825",
      airlines: ["6E"],
      currency: "USD",
    },
    [PAX_ADULT_1],
  );

  // Case 2: 2 Adults + 1 Child · Roundtrip · Direct — FA DUR→CPT
  const case2 = await runCase(
    "2 Adults + 1 Child · Roundtrip · Direct (FA DUR→CPT)",
    {
      tripType: "2", adultNum: 2, childNum: 1, infantNum: 0,
      fromCity: "DUR", toCity: "CPT",
      fromDate: "20260825", retDate: "20260829",
      airlines: ["FA"],
      currency: "USD",
    },
    [PAX_ADULT_1, PAX_ADULT_2, PAX_CHILD_1],
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY — paste these into the ATRIP UAT Testing form");
  console.log("=".repeat(60));
  if (case1) {
    console.log(`\n[Case 1] 1 Adult · Oneway · Connection · Prepayment`);
    console.log(`  Sandbox Order No.  : ${case1.orderNo}`);
    console.log(`  Airline PNR        : ${case1.pnr}`);
    console.log(`  Expected Total Fare: ${case1.fare}`);
    console.log(`  Currency           : ${case1.currency}`);
  }
  if (case2) {
    console.log(`\n[Case 2] 2 Adults + 1 Child · Roundtrip · Direct · Prepayment`);
    console.log(`  Sandbox Order No.  : ${case2.orderNo}`);
    console.log(`  Airline PNR        : ${case2.pnr}`);
    console.log(`  Expected Total Fare: ${case2.fare}`);
    console.log(`  Currency           : ${case2.currency}`);
  }
}

main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
