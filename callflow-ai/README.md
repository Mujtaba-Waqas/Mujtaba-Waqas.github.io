# CallFlow AI

**AI revenue recovery and front office for HVAC companies.**
CallFlow answers every call, captures and qualifies every lead, books real calendar slots, follows up on open estimates, and asks happy customers for reviews. It turns missed opportunities into booked jobs.

The demo workspace is **Summit Peak HVAC** (Salt Lake City, UT). It is pre-seeded with about 60 days of realistic activity, so every screen shows populated data.

> **Demo mode is the default.** No real calls, texts, charges, or AI API calls are made unless you configure provider credentials. Simulated items are labelled **Simulated** / **Demo** in the UI.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, Server Actions, `proxy.ts`), React 19, TypeScript |
| UI | Tailwind CSS v4, accessible primitives built in the shadcn style (Radix Dialog / Dropdown / Switch), Lucide icons, Sonner toasts |
| Forms & validation | React Hook Form + Zod (the same schemas run on client and server) |
| Charts | Recharts |
| Data | PostgreSQL 16 + Prisma 6 (SQL migrations in `prisma/migrations`) |
| Auth | DB-backed sessions (bcrypt, httpOnly cookie, SHA-256-hashed token at rest), role-based access control |
| Tests | Vitest (pure domain tests + Postgres integration tests) |
| Providers | `VoiceProvider`, `SmsProvider`, `AIProvider`, `CalendarProvider`, `PaymentProvider`, each with a working demo implementation plus Twilio / OpenAI / Google Calendar / Stripe adapters |

## Put it online

**👉 Beginner, step-by-step guide: [DEPLOY.md](./DEPLOY.md).** It covers Vercel + Neon, about 15 minutes, no coding, and gives you a public demo link. The deploy build runs migrations and loads the demo data automatically (`scripts/vercel-build.mjs`), and a nightly cron resets the public demo.

## Quick start (local)

Prerequisites: **Node 20+** (tested on 22) and **PostgreSQL 14+**. Docker is optional.

```bash
cd callflow-ai
cp .env.example .env              # defaults work with the docker-compose database
docker compose up -d              # or point DATABASE_URL at your own Postgres
npm install                       # also runs `prisma generate`
npm run db:migrate                # apply migrations
npm run db:seed                   # load the Summit Peak HVAC demo tenant
npm run dev                       # http://localhost:3000
```

To reset the database to a fresh demo state at any time, run `npm run db:reset`. It drops the database, re-migrates, and re-seeds. Seed data is relative to "now", so the dashboard always covers the last 30 days.

### Demo credentials

| User | Email | Password | Role |
|---|---|---|---|
| Olivia Chen | `olivia@summitpeakhvac.demo` | `CallFlowDemo!2026` | Owner |
| Marcus Reed | `marcus@summitpeakhvac.demo` | `CallFlowDemo!2026` | Dispatcher |
| Jake Morrison | `jake@summitpeakhvac.demo` | `CallFlowDemo!2026` | Technician |

The login page also has a one-click **Sign in with demo account** button. Disable it in production with `DEMO_LOGIN_ENABLED=false`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit + database integration tests (needs `DATABASE_URL`; tests create and delete their own tenants) |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:migrate:dev` | Create a new migration after editing `schema.prisma` |
| `npm run db:seed` | Rebuild the demo tenant (idempotent) |
| `npm run db:reset` | Drop, migrate, and seed |

## Five-minute demo script

1. **Sign in** with the demo account. The **Dashboard** shows attributed recovered revenue, calls answered, conversion, response time, urgent leads, upcoming jobs, and live activity.
2. **Calls → Open call simulator → "After-hours AC emergency" → Place simulated call.** Press **Say** to send each pre-filled caller line (you can edit any line). The AI:
   - flags the emergency (92°F plus a newborn)
   - collects name, phone, and address
   - confirms the ZIP is in the service area
   - offers real on-call windows
   - books the appointment and sends an SMS confirmation

   The right-hand panel shows the lead, appointment, transcript, timeline events, and SMS as they are created.
3. **Estimates → EST-1001 (Derek Hansen) → Run automation now.** The next due follow-up (day 3) is sent immediately as a simulated SMS and logged in the automation activity log.
4. **Inbox → Derek Hansen.** The follow-up appears with an *Automation · Simulated* label.
5. **On the estimate page (or in the Inbox), under "Demo: simulate customer reply", click STOP.** The customer is opted out, remaining follow-ups are cancelled, one compliance confirmation is sent, and a red banner explains why. Run the automation again: nothing is sent to Derek, and any manual text is recorded as **Blocked**.
6. Try the other paths:
   - reply **YES** on another open estimate (accepted and attributed as recovered)
   - reply **5** or **2** to Will Bingham's satisfaction check (review link vs. owner escalation)
   - the out-of-area, price-question, and human-transfer simulator scenarios

## What works in demo mode

Everything in the UI runs locally without credentials:

- **AI receptionist**: a deterministic, auditable state machine (`src/lib/domain/receptionist.ts`). It extracts intents and fields, triages urgency (including gas/CO safety escalation), validates the service area by ZIP, checks availability against real bookings and travel buffers, books appointments, transfers to staff, and quotes prices only from the knowledge base.
- **Call simulator** with 6 scenarios plus free-form input. Calls, transcripts, AI summaries, leads, appointments, timeline events, and usage records are all saved.
- **Inbox**: two-pane SMS view with an AI-suggested reply (grounded in the knowledge base), a human-takeover toggle, opt-out handling, and a simulated inbound pipeline.
- **Leads pipeline** (7 stages with stage buttons, filters, and a detail page with timeline and notes), plus **Customers** (profiles, service history, calls, messages, estimates, review status).
- **Calendar**: day/week views, technician columns, business-hours shading, travel buffers, emergency slots, availability suggestions, booking with conflict prevention, reschedule, cancel, complete, no-show, and confirmation/reminder tracking.
- **Estimates**: create/edit line items, mark sent (schedules day 1/3/7 follow-ups), accept/decline, pause/resume, assign, manual follow-up, and revenue attribution.
- **Automations**: Estimate Recovery, Appointment Reminders, Review Requests, Missed Call Recovery, and New Lead Follow-Up. Each has an enable toggle, editable templates and delays, stop conditions, an activity log, and **Run now (demo)**.
- **Reviews**: satisfaction check, then either a review link or owner escalation. Incentive wording is rejected, and the review-gating policy is configurable.
- **Knowledge Base** CRUD, **AI Receptionist** settings with a test-answer panel and a prohibited-claims filter.
- **Analytics** with 7/30/90-day ranges, **Integrations** status, **Billing** (demo plan switching), **Settings** (company, hours, emergency policy, ZIP territory, team, review policy, audit log), and a **10-step onboarding** wizard that also creates additional companies from the org switcher.

## Integrations that require credentials to go live

| Integration | Env vars | Behaviour once configured |
|---|---|---|
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Inbound voice/SMS webhooks are signature-verified. Outbound SMS is sent **only** if `SMS_LIVE_SENDING=true`. |
| **OpenAI** | `OPENAI_API_KEY` (`OPENAI_MODEL` optional) | Used for call summaries, suggested replies, and KB answers. Output is grounded in retrieved KB docs and filtered for prohibited claims. Routing decisions stay rule-based. |
| **Google Calendar** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ACCESS_TOKEN` | Events are pushed on booking/cancel and free/busy is available. The full OAuth consent flow is Phase 2. |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER/GROWTH/PRO` | Real Checkout and Customer Portal, plus a signed webhook that updates the subscription. |
| Jobber, Housecall Pro, ServiceTitan, QuickBooks, HubSpot | – | Shown as "Coming soon". The enum, catalog, and integration table are ready for adapters. |

### Webhook setup

| Method | Path | Configure in |
|---|---|---|
| POST | `/api/webhooks/twilio/voice` | Twilio number → Voice → "A call comes in" (HTTP POST) |
| POST | `/api/webhooks/twilio/voice/turn?callId=…` | Set automatically by the TwiML `<Gather action>` |
| POST | `/api/webhooks/twilio/sms` | Twilio number → Messaging → "A message comes in" |
| POST | `/api/webhooks/stripe` | Stripe Dashboard → Webhooks (`checkout.session.completed`, `customer.subscription.*`) |
| POST | `/api/public/leads` | Your website form (JSON: `organization`, `name`, `phone`, `smsConsent: true`, optional `email`, `zip`, `service`, `message`) |
| GET/POST | `/api/cron/automations` | Any scheduler, every 5 minutes (daily on Vercel Hobby), with `Authorization: Bearer $CRON_SECRET` |
| GET/POST | `/api/cron/reset-demo` | Nightly public-demo reset (Bearer `CRON_SECRET`, only when `PUBLIC_DEMO=true`) |
| GET | `/api/health` | Uptime checks. Reports DB status and which providers are live vs. simulated. |

`APP_URL` must be the exact public URL Twilio calls, because signatures are computed over it. The org is resolved from the called number (`organizations.phone`) or `DEFAULT_ORG_SLUG`.

All UI mutations are **Server Actions** (`src/app/(app)/actions.ts`, `settings-actions.ts`, `onboarding/actions.ts`). Each one authenticates from the session, checks a permission, and validates with Zod before calling the service layer.

## Deployment recommendations

- **Public demo:** follow [DEPLOY.md](./DEPLOY.md). `vercel.json` sets the build command (`node scripts/vercel-build.mjs`: generate, then migrate using the unpooled URL, then seed, then build) and two daily crons (`/api/cron/reset-demo`, `/api/cron/automations`).
- **Customer deployments:** Vercel Pro, Render, Fly.io, or any Node host. Set every variable from `.env.example`, set `DEMO_LOGIN_ENABLED=false`, `PUBLIC_DEMO=false` and `DEMO_SEED_ON_DEPLOY=false`, and set `APP_URL` to the real domain.
- **Database:** managed Postgres (Neon, Supabase, RDS). Run `npm run db:migrate` in the release step. Seed only non-production environments.
- **Scheduler:** Vercel Cron or a GitHub Action calling `POST /api/cron/automations` every 5 minutes.
- **Rate limiting:** the built-in limiter is in-memory (single instance). Use Redis/Upstash for multi-instance deployments.
- **Observability:** send logs to your platform's log drain and add Sentry/OpenTelemetry before real customers.

## Known limitations

- The receptionist is deterministic and English-only. It handles the common HVAC intents well, but unusual phrasing can fall back to asking again. Live voice uses Twilio `<Gather input="speech">`; a real-time streaming voice agent is Phase 2.
- Simulated calls have transcripts but no audio. Seeded "recorded" calls have no audio files.
- The Google Calendar adapter needs an access token supplied via env; OAuth storage and refresh are not implemented yet.
- Estimates have no customer-facing view/e-sign page. "Viewed" status is seeded, not tracked.
- The rate limiter and "Run now" are single-instance. There is no job queue (automations run inline when triggered).
- The review flow is "satisfaction check first" by default, as requested. Google discourages review gating, so the more conservative **Offer the link to every customer** policy is one click away in Settings.
- Only the Owner demo account is used in the walkthrough. Dispatcher and Technician roles are enforced, but their navigation is simply a filtered view.

## Production-readiness checklist

- [ ] `DEMO_LOGIN_ENABLED=false`, strong `CRON_SECRET`, HTTPS-only `APP_URL`
- [ ] Twilio: A2P 10DLC brand/campaign registration, Advanced Opt-Out enabled, webhook URLs set, `SMS_LIVE_SENDING=true` only after compliance review
- [ ] Call recording: legal review of consent requirements for every state you serve (all-party consent states), disclosure kept on
- [ ] Stripe live keys, price IDs, webhook secret; tax and overage pricing configured
- [ ] Postgres backups, point-in-time recovery, connection pooling
- [ ] Redis-backed rate limiting and a durable job queue for automations
- [ ] Error monitoring, uptime checks on `/api/health`, log retention policy
- [ ] Password reset, email verification, MFA; invite flow for team members
- [ ] Data retention/deletion policy (transcripts, recordings, messages), DPA with subprocessors
- [ ] Load test the voice webhook path; timeouts under Twilio's 15-second limit
- [ ] Accessibility audit (keyboard and screen reader) and cross-browser QA

## Project layout

```
callflow-ai/
├── prisma/            schema.prisma, migrations/, seed.ts (entry point)
├── scripts/           vercel-build.mjs (deploy build: migrate → seed → build)
├── src/
│   ├── app/           routes: (app)/* dashboard pages, login, onboarding, api/*
│   ├── components/    ui/* primitives, app/* shared widgets, charts/*
│   ├── lib/
│   │   ├── domain/    pure logic: receptionist engine, urgency, service area, availability, follow-up rules, KB retrieval
│   │   ├── services/  tenant-scoped data services (leads, calls, estimates, automations, messaging, scheduling…)
│   │   ├── providers/ provider interfaces + demo / twilio / openai / google / stripe adapters
│   │   ├── demo/      seed-demo.ts + seed-data.ts (Summit Peak HVAC demo tenant)
│   │   ├── auth/      sessions, passwords, RBAC
│   │   └── validation/ Zod schemas
│   └── proxy.ts       optimistic auth redirect (Next 16 "proxy", formerly middleware)
├── tests/             Vitest suites
└── docs/              plan.md, architecture.md, roadmap.md
```
