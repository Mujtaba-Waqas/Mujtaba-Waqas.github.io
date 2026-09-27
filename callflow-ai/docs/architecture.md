# CallFlow AI — Architecture

## Overview

```
 Browser (React 19 client components)
   │  Server Actions (Origin-checked, session cookie)        Twilio / Stripe / website / scheduler
   ▼                                                          │  HTTPS webhooks (signed, rate-limited)
 Next.js 16 App Router  ── pages (RSC) ───────────────┐       ▼
   │                                                  │   /api/webhooks/* · /api/public/leads · /api/cron/automations
   ▼                                                  ▼       │
 lib/actions.ts  secureAction(permission, zodSchema, handler) │
   │  builds TenantContext { orgId, userId, role } from the SESSION (never from input)
   ▼                                                          ▼
 lib/services/*   tenant-scoped use cases  ◄──────────────── systemContext(orgId) resolved from the called number / slug / Stripe metadata
   │        │                    │
   │        ▼                    ▼
   │   lib/domain/* (pure)   lib/providers/*  → Demo | Twilio | OpenAI | Google | Stripe
   ▼
 Prisma → PostgreSQL (every tenant row carries organizationId)
```

### Layers

| Layer | Responsibility | Rules |
|---|---|---|
| `src/app/**` | Routing, rendering, forms | No business logic; server components call services directly with a context built from `requireAuth()` |
| `lib/actions.ts` | Server-action wrapper | Auth → RBAC → Zod parse → service → safe error mapping |
| `lib/services/*` | Use cases (book appointment, run automation, handle inbound SMS, process a call turn…) | Every query filters by `ctx.orgId`; every reference id passed in is re-checked against the org; audit log for sensitive actions |
| `lib/domain/*` | Pure, deterministic logic | No I/O; fully unit-tested |
| `lib/providers/*` | External vendors behind interfaces | Demo implementation always available; live adapters selected by env |

## Core data flow: an inbound call

1. **Twilio** `POST /api/webhooks/twilio/voice` (or the **simulator** `startSimulationAction`).
   - Signature check, rate limit, idempotency on `CallSid`.
   - The org is resolved from the called number.
2. `services/calls.startCall`
   - Creates a `Call` (IN_PROGRESS).
   - Builds the **EngineContext**: settings, service areas, KB docs, technicians, busy blocks, and caller-ID customer match.
   - Runs `startConversation`, stores transcript turn 0, and logs "call answered".
3. Each utterance → `processCallTurn`:
   - `domain/receptionist.processTurn(state, text, ctx)` returns `{ state, reply, effects }`. It is pure.
   - The service applies the effects:
     - `ENSURE_LEAD` → customer + lead (QUALIFIED; source AFTER_HOURS_CALL / PHONE / REPEAT_CUSTOMER)
     - `EVENT` → `lead_events`, back-attached to the lead once it exists
     - `BOOK` → `scheduling.bookAppointment` (advisory lock + conflict check). If the slot was lost to a race, the reply is replaced with fresh options.
     - `SEND_CONFIRMATION_SMS` → `messaging.sendSms`, which checks opt-out, calls the provider, stores the message, and meters usage
     - `TRANSFER`, `PAGE_ON_CALL`, `FLAG_HUMAN_FOLLOWUP`, `END`
   - Engine state is persisted on `calls.engineState`, so the conversation is resumable and stateless between HTTP requests.
4. On `END`, `finalizeCall` does the following:
   - computes the duration
   - marks out-of-area leads LOST
   - generates a structured summary (`AIProvider.summarizeCall`: rules, or OpenAI with rules fallback)
   - records usage

### Receptionist decision order (per turn)
1. Extract fields: name, phone, email, street address (including Utah grid addresses), city, ZIP, issue/service, time preference.
2. Re-assess urgency over everything the caller has said.
3. **Safety hazard** (gas, CO, fire): give safety instructions, page on-call, transfer, end.
4. **Human requested**: during business hours (or for an emergency), warm transfer. After hours, set a priority callback flag and continue.
5. Awaiting a slot: parse the choice (ordinal, hour, or yes). "None of those" gets the next page of slots.
6. **Price question**: answer only from PRICING/FINANCING KB entries, or defer.
7. Collect what's missing: issue → name → phone (caller-ID confirm) → address/ZIP → service-area check → time preference → offer slots.

Emergency slots use any hour of the day with the on-call technician first. Standard slots use business hours, the booking horizon, minimum lead time, service duration, and the travel buffer.

## Estimate recovery flow

`markEstimateSent` creates `followups` rows for stage 1/2/3 at +24h / +72h / +168h (the delays are editable per automation).
`runAutomation("ESTIMATE_RECOVERY")` (cron = due items only, "Run now" = next pending stage immediately) does the following for each estimate:

```
getFollowupStopReason({ status, paused, optedOut, humanTakeover, enabled, expiresAt })
  → OPTED_OUT | ACCEPTED | DECLINED | EXPIRED | NOT_SENT | HUMAN_REQUESTED | PAUSED | AUTOMATION_DISABLED | null
null  → render template → sendSms → followup SENT, estimate.followupStage++ , lead_event, run log "action"
stop  → cancel remaining followups with reason, estimate.automationStopReason, run log "stop"
```

Every run writes an `automation_runs` row with counts and a structured log.
Inbound replies (`services/inbound-sms.handleInboundSms`) are handled in this order:
**STOP/START/HELP** (full-message match) → opted-out guard → **person requested** (human takeover + cancel follow-ups) → **satisfaction reply** (review link or owner escalation) → **YES/NO on an open estimate** (accept with attribution, or decline) → store.

Revenue attribution: `estimates.recoveredByAutomation = accepted && followupStage > 0`. The dashboard's *attributed recovered revenue* = recovered estimates + AI bookings from after-hours calls and missed-call recoveries (using the booked job's estimated value). It is always labelled *estimated/attributed*.

## Provider interfaces (`lib/providers/types.ts`)

| Interface | Demo implementation | Live adapter | Selected when |
|---|---|---|---|
| `SmsProvider.send` | Returns a `SIM…` sid; the message is stored as SIMULATED | Twilio REST | Twilio creds **and** `SMS_LIVE_SENDING=true` |
| `VoiceProvider` (TwiML builders + `verifyWebhookSignature`) | TwiML without signature checks (dev only) | Twilio HMAC-SHA1 validation | Twilio creds |
| `AIProvider` (`summarizeCall`, `suggestSmsReply`, `answerQuestion`) | Rules + KB retrieval | OpenAI Chat Completions, KB-grounded, prohibited-claims filter, rules fallback on any error | `OPENAI_API_KEY` |
| `CalendarProvider` (`listBusy`, `createEvent`, `cancelEvent`) | Internal calendar (no-op) | Google Calendar REST | Google env vars |
| `PaymentProvider` (`createCheckoutSession`, `createPortalSession`, `verifyWebhook`) | Local plan switch labelled "demo billing" | Stripe REST + HMAC-SHA256 signature (5-min tolerance) | Stripe env vars |

To add an adapter (for example Jobber):
1. Add an `IntegrationProvider` enum value and migration.
2. Add a catalog entry in `lib/integrations-catalog.ts`.
3. Implement the relevant interface, or a new `CrmProvider` interface.
4. Select it in `lib/providers/index.ts`.

## Security model

- **Authentication:** bcrypt(12) password hashes. A random 256-bit session token goes in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); only its SHA-256 hash is stored. Sessions expire after 7 days. Login is rate-limited per IP.
- **Tenant isolation:** the active organization comes from the session row and must match a membership. Services never accept `organizationId` from input. Every read uses `findFirst({ where: { id, organizationId } })`, and foreign ids (customer, technician, lead, service, employee) are re-validated inside the tenant. Cross-tenant access returns *Not found*. This is covered by `tests/tenant.test.ts`.
- **Authorization:** `lib/auth/rbac.ts` maps Owner/Admin/Dispatcher/Technician to permissions. The permission is checked in every server action and page, and the sidebar is filtered by it.
- **CSRF:** Server Actions enforce Origin/Host matching (Next.js), cookies are SameSite=Lax, and there are no state-changing GET routes. Public POST endpoints are authenticated by provider signatures or a bearer secret, not cookies.
- **Webhooks:**
  - Twilio: `X-Twilio-Signature` HMAC-SHA1 over the public URL plus sorted params
  - Stripe: `Stripe-Signature` HMAC-SHA256 with timestamp tolerance
  - All webhooks are idempotent via `webhook_events`, rate-limited per IP, and fail closed in production if unsigned.
- **Input validation:** Zod on every action and route, with length caps on all free text. The public lead form has a honeypot and requires explicit SMS consent.
- **Secrets:** read from `process.env` in server-only modules (`import "server-only"`). The integrations table stores only non-secret config, and no secrets reach client bundles.
- **Headers:** CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, and HSTS in production (`next.config.ts`).
- **Errors:** domain errors map to user-safe messages. Unexpected errors are logged server-side and shown generically.
- **Messaging compliance:**
  - STOP-family keywords opt out immediately. One confirmation is sent, and every later outbound message is stored as BLOCKED.
  - START re-subscribes. HELP returns contact info.
  - Consent timestamps are stored per customer.
- **Reviews:** templates with incentive language are rejected (FTC 16 CFR 465). The AI never writes or posts reviews. The review-gating policy is configurable.
- **Recording:** a disclosure is spoken first whenever recording is enabled. The UI documents all-party-consent states.
- **Audit log:** logins create sessions, and sensitive actions (settings, stage changes, estimate decisions, opt-outs, automation runs, billing) write `audit_logs`.

## Data model highlights

Required tables: organizations, users, memberships, employees, customers, leads, lead_events, calls, call_transcripts, messages, appointments, services, estimates, estimate_items, followups, automations, automation_runs, reviews, knowledge_documents, integrations, subscriptions, usage_records, audit_logs.
Supporting tables: sessions, conversations, service_areas, webhook_events.

- Unique `(organizationId, phone)` on customers, `(organizationId, number)` on estimates, `(estimateId, stage)` on followups, and `(organizationId, zip)` on service areas.
- Indexes on the hot paths: `(organizationId, createdAt|startedAt|startAt|status)`, `(technicianId, startAt)`, and `(organizationId, status, scheduledFor)` for due follow-ups.
- Money is stored in integer cents. Organization settings are JSON validated by `orgSettingsSchema`.
