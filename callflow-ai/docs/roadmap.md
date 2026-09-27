# CallFlow AI — Roadmap

## Phase 1 — Deployable demo / MVP *(this repository)*
- Multi-tenant schema, migrations, RBAC, audit log, DB sessions
- Deterministic AI receptionist, call simulator, transcripts, summaries
- Inbox with opt-out handling, human takeover, AI-suggested replies
- Leads pipeline, customers, calendar with conflict-safe booking
- Estimates with Day 1/3/7 recovery, stop rules, revenue attribution
- Review workflow, knowledge base, receptionist settings, five automations
- Analytics, integrations page, demo billing, onboarding wizard
- Provider interfaces with demo implementations; Twilio/OpenAI/Google/Stripe adapters
- **Exit criteria:** deploy to a staging URL on managed Postgres with a cron runner; pilot with 1–2 friendly HVAC shops in "shadow mode" (AI drafts, humans send).

## Phase 2 — Real Twilio, OpenAI, Google and Stripe
- **Voice:** Twilio Media Streams + a real-time speech pipeline (STT → engine → TTS), with barge-in and < 800 ms turn latency. Keep the deterministic engine as the policy layer; use the LLM for language understanding and phrasing only.
- Number provisioning from the app, A2P 10DLC registration flow, Twilio Advanced Opt-Out sync, delivery-status callbacks.
- Call recording storage (S3 with encryption and retention policy) with per-state consent configuration.
- **OpenAI:** structured extraction (function calling) as a second opinion to the rules; eval suite built from simulator scenarios; red-team prompts for prohibited claims.
- **Google Calendar:** OAuth consent, encrypted refresh tokens, per-technician calendar mapping, two-way sync via push notifications.
- **Stripe:** usage-based overages (voice minutes, SMS), dunning, plan limits enforced in-app, invoices page.
- Durable job queue (e.g. Postgres-backed or Redis) for automations, retries, and a dead-letter view; Redis rate limiting.
- Password reset, email verification, MFA, team invites.

## Phase 3 — Field-service & business-system integrations
- **Jobber, Housecall Pro, ServiceTitan:** import customers, jobs, and estimates; push AI bookings as jobs; read estimate status to drive recovery automatically.
- **QuickBooks:** sync invoices/payments to replace "estimated" attribution with booked revenue.
- **HubSpot:** contact/deal sync and marketing-list suppression for opted-out customers.
- A generic `CrmProvider` / `FieldServiceProvider` interface with webhook ingestion and conflict resolution (source-of-truth rules per field).
- Customer-facing estimate page with view tracking and e-signature.

## Phase 4 — Multi-location & enterprise
- Locations under an organization: numbers, hours, territories, technicians, and KB overrides per location; routing by called number or ZIP.
- Roll-up analytics across locations; franchise/agency accounts managing many organizations.
- SSO (SAML/OIDC), SCIM provisioning, granular custom roles, IP allow-lists.
- Data residency options, SOC 2 Type II program, configurable retention, full audit export.
- Advanced workflow builder (branching automations, A/B-tested templates), maintenance-plan renewals, seasonal campaigns with consent management.
- Spanish-language receptionist and multilingual SMS.
