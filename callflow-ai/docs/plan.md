# CallFlow AI — Implementation Plan

## Repository findings
The repository root is a static GitHub Pages portfolio (`index.html`, `README.md`, resume PDF).
To avoid touching unrelated files, CallFlow AI lives entirely in the `callflow-ai/` subdirectory.

## Stack decisions
| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript | Latest stable, server components + server actions |
| Styling | Tailwind CSS v4 + hand-built shadcn-style primitives (Radix for dialog/menu/switch/tabs) | Accessible, no CLI dependency |
| Data | PostgreSQL + Prisma 6 (SQL migrations checked in) | Prisma 6 is the current stable line (7/8 are pre-release for this project's needs) |
| Auth | Custom DB-backed sessions (bcrypt + opaque httpOnly cookie, hashed token at rest) | NextAuth-style credential sessions without beta dependencies; RBAC per membership |
| Validation | Zod everywhere (server actions, route handlers, forms via React Hook Form) | |
| Charts | Recharts | |
| Tests | Vitest (pure domain tests + Postgres integration tests) | |
| Providers | `VoiceProvider`, `SmsProvider`, `CalendarProvider`, `PaymentProvider`, `AIProvider` | Demo implementations by default; Twilio/OpenAI/Google/Stripe adapters activate only when env credentials exist |

## Build order
1. Schema + migration + seed (Summit Peak HVAC, data relative to "now").
2. Pure domain logic: service area, emergency detection, availability/conflicts, follow-up stop rules, SMS keywords, deterministic receptionist engine, knowledge retrieval.
3. Service layer (tenant-scoped, audited) + provider registry.
4. Auth, proxy, app shell, org switcher, RBAC.
5. Pages: dashboard → calls + simulator → inbox → leads → customers → calendar → estimates → reviews → automations → knowledge base → AI receptionist → analytics → integrations → billing → settings → onboarding.
6. Webhooks (Twilio voice/SMS, Stripe), public lead form API, cron automation runner, rate limiting.
7. Tests, lint, typecheck, build. Docs (README, architecture, roadmap).

## Acceptance path (must work end-to-end)
Login → dashboard → Call Simulator (after-hours emergency) → lead + appointment + transcript + timeline + simulated SMS →
estimate page → Run automation now → message visible in Inbox + activity log → simulate customer "STOP" → automation stops.
