# Pricing and the pilot offer

## Price list (from the app)

| Plan | Price | Best for |
|---|---|---|
| Starter | $199/mo | 1–5 techs: text-back, lead capture, basic scheduling |
| Growth | $399/mo | 5–15 techs: plus estimate recovery, reviews, integrations |
| Pro | $699/mo | 15–30 techs or multiple locations |

**Suggestion for your first 3–5 customers ("founding customers"):**
- A free 30-day pilot, then **50% off for the first 6 months** in exchange for a testimonial and a case study.
- Honest early customers are worth more than full price right now.

## The pilot: simple terms to put in writing
Write these in an email and ask the owner to reply "Yes, sounds good." That reply is your agreement for a small pilot.

1. **Length:** 30 days from go-live.
2. **Scope:** missed-call text-back and estimate follow-up. AI after-hours answering is optional.
3. **Cost:** free during the pilot. After it, $[price]/month, month to month, cancel anytime.
4. **Their approval:** they approve every message template before it goes live.
5. **Their data:** it stays theirs, and you delete it if they cancel.
6. **Texting consent:**
   - Only customers who contacted the business, or gave consent, are texted.
   - STOP is always honored.
   - US business texting requires registration (A2P 10DLC), which you handle.
7. **Success check:** a 20-minute review meeting on day 30.

## Getting paid (Venmo)
1. Make a **Venmo Business profile** in the Venmo app: tap your picture → your name at the top → **Create a business profile**. It's free; Venmo takes a small fee per payment (about 2%, check Venmo's current rate). Don't use a personal Venmo for business: Venmo can freeze personal accounts that take business payments.
2. In Vercel (your **real** app, not the demo), add `PAY_VENMO_HANDLE` = your business handle, e.g. `@callflow-mujtaba`, and redeploy. The customer's **Billing** page then shows how much to send, where, and what to put in the note. Zelle works too: `PAY_ZELLE` = your Zelle email or phone.
3. On day 30, after the results meeting, send: *"Thanks [Name]! To keep it running, send $[price] by Venmo to @[handle] with the note 'CallFlow – [Company]'. Same date each month, cancel anytime with a text."*
4. When money arrives, mark it in your tracker (**Pilot results** tab). Two days before each monthly due date, send a friendly Venmo **Request** for the amount.
5. If a payment is 7+ days late, send one reminder; if it's 14 days late, pause their service (turn off the automations) until it's paid.
6. Keep a list of every payment. It's taxable income: put about 25–30% aside for taxes, and Venmo Business may send you a 1099-K.

## What to measure (proves it works)
- Missed calls texted back, and how many became booked jobs
- After-hours calls answered, and how many emergencies were booked
- Estimates followed up, and how many were accepted after a follow-up
- Estimated revenue from those jobs, using their real invoice amounts

At day 30, put the numbers on one slide or in one email:
> "In 30 days CallFlow texted back 23 missed calls, 6 booked, about $2,900 in repairs, and recovered 1 install estimate worth $7,400."

With their permission, that becomes your case study.

## Your costs per customer (rough, check current prices)
- **Twilio number:** about $1–2/month.
- **Texts:** roughly a cent each.
- **Business texting registration:** small one-time and monthly fees.
- **Hosting:** Vercel Pro (~$20/month) and a paid database plan once you have paying customers. These are shared across all customers.
- **AI voice minutes:** only if you turn on AI phone answering.

A text-back and follow-up customer typically costs you a small fraction of a $199 plan. Track it per customer.

## Getting paid
- **Early on:** Stripe Payment Links (no code) or invoices from Stripe/QuickBooks.
- **Later:** turn on the built-in Stripe billing (see `README.md` → Integrations).
- **Before you charge anyone:** set up a simple business (an LLC in Utah is common) and a separate business bank account.
