# Price Verification & Acceptance

<cite>
**Referenced Files in This Document**
- [flow.ts](file://src/lib/calendair/flow.ts)
- [store.ts](file://src/lib/calendair/store.ts)
- [types.ts](file://src/lib/calendair/types.ts)
- [accept-price/route.ts](file://src/app/api/calendair/session/[id]/accept-price/route.ts)
- [book/route.ts](file://src/app/api/calendair/session/[id]/book/route.ts)
- [state/route.ts](file://src/app/api/calendair/session/[id]/state/route.ts)
- [booking/page.tsx](file://src/app/(calendair)/booking/page.tsx)
- [e2e.mjs](file://scripts/e2e.mjs)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the price verification and acceptance workflow that ensures users explicitly approve any fare changes before booking proceeds. It covers:
- Reverification of live fares after user authorization
- Handling price increases, unchanged prices, and unavailable trips
- The acceptPrice function and state transitions to PRICE_CONFIRMED
- Safety guarantees that prevent booking without explicit approval
- UI examples for price change notifications, user acceptance flows, and fallback scenarios when no replacement is available

## Project Structure
The price verification and acceptance flow spans server routes, a domain flow module, session store, types, and the booking UI.

```mermaid
graph TB
UI["Booking UI<br/>src/app/(calendair)/booking/page.tsx"] --> API_Authorize["Authorize API<br/>authorize route"]
API_Authorize --> Flow["Flow engine<br/>src/lib/calendair/flow.ts"]
Flow --> Store["Session store<br/>src/lib/calendair/store.ts"]
Flow --> Types["Domain types<br/>src/lib/calendair/types.ts"]
UI --> API_Accept["Accept Price API<br/>accept-price route"]
API_Accept --> Flow
UI --> API_Book["Book API<br/>book route"]
API_Book --> Flow
UI --> API_State["State API<br/>state route"]
API_State --> Store
```

**Diagram sources**
- [flow.ts:65-176](file://src/lib/calendair/flow.ts#L65-L176)
- [accept-price/route.ts:1-15](file://src/app/api/calendair/session/[id]/accept-price/route.ts#L1-L15)
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)
- [state/route.ts:1-34](file://src/app/api/calendair/session/[id]/state/route.ts#L1-L34)
- [store.ts:1-117](file://src/lib/calendair/store.ts#L1-L117)
- [types.ts:197-215](file://src/lib/calendair/types.ts#L197-L215)
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)

**Section sources**
- [flow.ts:65-176](file://src/lib/calendair/flow.ts#L65-L176)
- [accept-price/route.ts:1-15](file://src/app/api/calendair/session/[id]/accept-price/route.ts#L1-L15)
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)
- [state/route.ts:1-34](file://src/app/api/calendair/session/[id]/state/route.ts#L1-L34)
- [store.ts:1-117](file://src/lib/calendair/store.ts#L1-L117)
- [types.ts:197-215](file://src/lib/calendair/types.ts#L197-L215)
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)

## Core Components
- Flow engine (reverify, acceptPrice, book): Implements the state machine and safety checks around pricing and booking.
- Session store: Holds per-session booking state, activity log, and lifecycle management.
- Domain types: Define BookingState values and data contracts used across the flow.
- API routes: Expose endpoints for authorize, accept-price, book, and state polling.
- Booking UI: Renders checkpoints, price change notifications, and confirmation screens; drives user actions.

Key responsibilities:
- Reverify live fares immediately after user authorization.
- Stop on price changes or unavailability until the user decides.
- Require explicit acceptance via acceptPrice before allowing booking.
- Enforce that only an approved total can be booked.

**Section sources**
- [flow.ts:65-176](file://src/lib/calendair/flow.ts#L65-L176)
- [flow.ts:192-248](file://src/lib/calendair/flow.ts#L192-L248)
- [store.ts:28-51](file://src/lib/calendair/store.ts#L28-L51)
- [types.ts:197-215](file://src/lib/calendair/types.ts#L197-L215)
- [accept-price/route.ts:1-15](file://src/app/api/calendair/session/[id]/accept-price/route.ts#L1-L15)
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)

## Architecture Overview
End-to-end flow from user authorization to confirmed booking with explicit price acceptance:

```mermaid
sequenceDiagram
participant U as "User"
participant UI as "Booking UI"
participant A as "Authorize API"
participant F as "Flow Engine"
participant S as "Session Store"
participant B as "Book API"
U->>UI : Select trip
UI->>A : POST /authorize(tripId)
A->>F : authorize(session, atlas, tripId)
F->>S : set state USER_AUTHORIZED
F->>F : reverify(displayedTotal)
alt Price unchanged and available
F-->>A : {kind : "confirmed", total, currency}
A-->>UI : outcome.confirmed
else Price changed
F-->>A : {kind : "price-changed", previous, current, currency}
A-->>UI : outcome.price-changed
UI->>UI : Show PriceChanged card
U->>UI : Click "Accept new price"
UI->>B : POST /accept-price
B->>F : acceptPrice(session)
F->>S : set state PRICE_CONFIRMED
F-->>B : {kind : "confirmed"}
B-->>UI : state=PRICE_CONFIRMED
UI->>B : POST /book
B->>F : book(session, atlas)
F->>S : set state BOOKING_CREATING/BOOKING_PENDING
F-->>B : {ok : true, result}
B-->>UI : result + state
else Unavailable
F-->>A : {kind : "unavailable", replacement?}
A-->>UI : outcome.unavailable
UI->>UI : Show Replacement card or Safe stop
end
```

**Diagram sources**
- [flow.ts:65-176](file://src/lib/calendair/flow.ts#L65-L176)
- [flow.ts:192-248](file://src/lib/calendair/flow.ts#L192-L248)
- [accept-price/route.ts:1-15](file://src/app/api/calendair/session/[id]/accept-price/route.ts#L1-L15)
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)

## Detailed Component Analysis

### Reverification and State Transitions
- After user authorizes a trip, the system re-reads the live offer.
- If the offer is still bookable and the total matches the displayed price, the session moves to PRICE_CONFIRMED.
- If the offer is bookable but the total differs, the session moves to PRICE_CHANGED and waits for explicit acceptance.
- If the offer is not bookable, the session moves to SOLD_OUT and attempts one replan within limits; if no replacement clears constraints, it stops safely.

```mermaid
flowchart TD
Start(["Reverify"]) --> CheckAvail{"Offer bookable?"}
CheckAvail --> |No| SoldOut["Set state SOLD_OUT<br/>Attempt replan (bounded)"]
SoldOut --> HasReplacement{"Replacement found?"}
HasReplacement --> |Yes| ReturnUnavail["Return kind: unavailable with replacement"]
HasReplacement --> |No| SafeStop["Set state SAFE_STOP<br/>Return safe-stop reason"]
CheckAvail --> |Yes| Compare{"Total == displayed?"}
Compare --> |Yes| Confirmed["Set verified + approved totals<br/>State -> PRICE_CONFIRMED<br/>Return kind: confirmed"]
Compare --> |No| Changed["Set verified + previousTotal<br/>State -> PRICE_CHANGED<br/>Return kind: price-changed"]
```

**Diagram sources**
- [flow.ts:94-176](file://src/lib/calendair/flow.ts#L94-L176)

**Section sources**
- [flow.ts:94-176](file://src/lib/calendair/flow.ts#L94-L176)
- [types.ts:197-215](file://src/lib/calendair/types.ts#L197-L215)

### acceptPrice Function and Safety Guarantees
- acceptPrice validates that there is a verified offer and the session is in PRICE_CHANGED.
- On success, it records the approved total and currency, transitions to PRICE_CONFIRMED, logs an activity event, and returns a confirmed outcome.
- If conditions are not met, it returns a safe-stop outcome, preventing silent progression.

```mermaid
sequenceDiagram
participant UI as "Booking UI"
participant API as "accept-price route"
participant F as "Flow Engine"
participant S as "Session Store"
UI->>API : POST /accept-price
API->>F : acceptPrice(session)
alt Valid PRICE_CHANGED with verified offer
F->>S : Set approvedTotal, approvedCurrency
F->>S : Set state PRICE_CONFIRMED
F-->>API : {kind : "confirmed", total, currency}
API-->>UI : Updated state + booking
else Invalid state or missing verified
F-->>API : {kind : "safe-stop", reason}
API-->>UI : Error / no-op
end
```

**Diagram sources**
- [flow.ts:192-210](file://src/lib/calendair/flow.ts#L192-L210)
- [accept-price/route.ts:1-15](file://src/app/api/calendair/session/[id]/accept-price/route.ts#L1-L15)

**Section sources**
- [flow.ts:192-210](file://src/lib/calendair/flow.ts#L192-L210)
- [accept-price/route.ts:1-15](file://src/app/api/calendair/session/[id]/accept-price/route.ts#L1-L15)

### Booking Guardrails
- The book endpoint refuses to proceed unless the session is in PRICE_CONFIRMED and the approved total matches the verified fare.
- This enforces that no booking write occurs without explicit user approval of the exact total.

```mermaid
flowchart TD
BookReq["POST /book"] --> CheckState{"State == PRICE_CONFIRMED?"}
CheckState --> |No| Refuse["Return error: fare not confirmed"]
CheckState --> |Yes| CheckTotal{"Approved total == verified total?"}
CheckTotal --> |No| Refuse
CheckTotal --> |Yes| Create["Create booking with approved totals"]
Create --> Result["Return result + updated state"]
```

**Diagram sources**
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)
- [flow.ts:218-248](file://src/lib/calendair/flow.ts#L218-L248)

**Section sources**
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)
- [flow.ts:218-248](file://src/lib/calendair/flow.ts#L218-L248)

### UI: Price Change Notifications and User Acceptance
- When PRICE_CHANGED, the UI shows a clear notification comparing previous and new prices, explaining that no action has been taken yet.
- The user must click “Accept new price” to call acceptPrice; otherwise, booking cannot proceed.
- When PRICE_CONFIRMED, the UI presents a payment checkpoint showing the exact total to confirm, then calls book.

```mermaid
sequenceDiagram
participant U as "User"
participant UI as "Booking UI"
participant API as "accept-price route"
participant F as "Flow Engine"
Note over UI : Render PriceChanged card
U->>UI : Click "Accept new price"
UI->>API : POST /accept-price
API->>F : acceptPrice(session)
F-->>API : {kind : "confirmed"}
API-->>UI : state = PRICE_CONFIRMED
UI->>UI : Render PaymentCheckpoint
U->>UI : Click "Confirm this exact payment"
UI->>API : POST /book
API-->>UI : result + state
```

**Diagram sources**
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)
- [booking/page.tsx:374-461](file://src/app/(calendair)/booking/page.tsx#L374-L461)
- [booking/page.tsx:463-549](file://src/app/(calendair)/booking/page.tsx#L463-L549)
- [accept-price/route.ts:1-15](file://src/app/api/calendair/session/[id]/accept-price/route.ts#L1-L15)
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)

**Section sources**
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)
- [booking/page.tsx:374-461](file://src/app/(calendair)/booking/page.tsx#L374-L461)
- [booking/page.tsx:463-549](file://src/app/(calendair)/booking/page.tsx#L463-L549)

### Fallback Scenarios: Unavailable Trips and No Replacement
- If the original fare becomes unavailable, the system attempts one replan within configured limits and presents a replacement if found.
- If no replacement clears all hard constraints, the flow stops safely and does not book anything.

```mermaid
flowchart TD
Unavail["Offer unavailable"] --> Replan["Increment replans<br/>Find next best candidate"]
Replan --> Limit{"Within replan limit?"}
Limit --> |No| SafeStop["SAFE_STOP with reason"]
Limit --> |Yes| Found{"Replacement found?"}
Found --> |Yes| Present["Present replacement to user"]
Found --> |No| SafeStop
```

**Diagram sources**
- [flow.ts:147-176](file://src/lib/calendair/flow.ts#L147-L176)

**Section sources**
- [flow.ts:147-176](file://src/lib/calendair/flow.ts#L147-L176)
- [booking/page.tsx:148-174](file://src/app/(calendair)/booking/page.tsx#L148-L174)

## Dependency Analysis
- The booking UI depends on session state and exposes actions (authorize, acceptPrice, book, pollFulfilment).
- Server routes delegate to the flow engine, which mutates session state and interacts with the Atlas adapter for live verification and booking.
- The session store provides in-memory persistence and activity logging for auditability.

```mermaid
graph LR
UI["booking/page.tsx"] --> Routes["API routes"]
Routes --> Flow["flow.ts"]
Flow --> Store["store.ts"]
Flow --> Types["types.ts"]
Flow --> Atlas["Atlas adapter (external)"]
```

**Diagram sources**
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)
- [flow.ts:65-176](file://src/lib/calendair/flow.ts#L65-L176)
- [store.ts:1-117](file://src/lib/calendair/store.ts#L1-L117)
- [types.ts:197-215](file://src/lib/calendair/types.ts#L197-L215)

**Section sources**
- [booking/page.tsx:91-174](file://src/app/(calendair)/booking/page.tsx#L91-L174)
- [flow.ts:65-176](file://src/lib/calendair/flow.ts#L65-L176)
- [store.ts:1-117](file://src/lib/calendair/store.ts#L1-L117)
- [types.ts:197-215](file://src/lib/calendair/types.ts#L197-L215)

## Performance Considerations
- Reverification is performed once per authorization attempt; avoid redundant calls by relying on session state.
- The replan budget is bounded to prevent excessive recomputation; tune MAX_REPLANS based on provider latency and cost.
- Activity logs are capped to keep memory usage predictable during long sessions.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and how the system handles them:
- Booking refused before acceptance: The book endpoint requires PRICE_CONFIRMED and matching approved total; ensure acceptPrice was called successfully.
- Session expired: All routes return a session-expired error if the session is not found; refresh the session.
- No replacement available: The flow stops safely; guide the user back to search or alternative windows.

Validation references:
- E2E script asserts that booking is refused before acceptance and proceeds after acceptance.

**Section sources**
- [book/route.ts:1-23](file://src/app/api/calendair/session/[id]/book/route.ts#L1-L23)
- [flow.ts:218-248](file://src/lib/calendair/flow.ts#L218-L248)
- [e2e.mjs:121-147](file://scripts/e2e.mjs#L121-L147)

## Conclusion
The price verification and acceptance workflow enforces explicit user approval for any fare changes through a strict state machine:
- Reverification detects price changes or unavailability and pauses for user decisions.
- acceptPrice transitions the session to PRICE_CONFIRMED only when the user explicitly approves the new total.
- Booking is guarded to ensure only approved totals are written, preventing unauthorized charges.
- Fallback logic handles unavailable trips with bounded replanning and clear safe stops when no suitable replacement exists.

This design prioritizes transparency, safety, and user control throughout the booking process.