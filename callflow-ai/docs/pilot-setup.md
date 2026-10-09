# Launching your first real pilot (step by step)

This guide takes you from "a customer said yes" to real texts going to real homeowners. Take it slowly: every step matters for reliability and for texting rules.

**What the pilot includes:**
- **Missed-call text-back:** when the company misses a call, the caller gets a text within seconds. There's an optional voicemail, and the owner gets an alert.
- **Estimate follow-up:** day 1, 3 and 7 texts on open quotes, which stop when the customer replies.
- **Staff alerts:** the owner or dispatcher gets a text for replies, voicemails, and accepted estimates.
- **Inbox:** every conversation is in CallFlow, and staff can reply from there.

AI phone answering is optional. Start without it (see `sales/05-pricing-and-pilot.md`).

> ⏱️ **Plan for 1–3 weeks before the first real text.** Most of that is waiting for US carrier approval (A2P 10DLC). Start Step 3 as soon as a customer agrees.

---

## Two separate websites

| | Public demo | Real app |
|---|---|---|
| Who uses it | Prospects clicking around | Your paying or pilot customers |
| Guide | `DEPLOY.md` | **this file** |
| Data | Fake Summit Peak HVAC, reset nightly | Real customers, never reset |
| Texts | Always simulated | Real (once enabled) |

**Keep them separate:** a separate Vercel project and a separate Neon database. Never put real customers on the public demo.

## Step 1: Create the real app (Vercel)

1. Vercel dashboard → **Add New… → Project** → import the same repo again.
   - Name it something like `callflow-app`.
   - Set **Root Directory** to `callflow-ai`.
2. Add these environment variables:

   | Name | Value |
   |---|---|
   | `PUBLIC_DEMO` | `false` |
   | `DEMO_LOGIN_ENABLED` | `false` |
   | `DEMO_SEED_ON_DEPLOY` | `false` |
   | `CRON_SECRET` | a new long random string (different from the demo's) |
   | `BOOTSTRAP_ADMIN_EMAIL` | your email |
   | `BOOTSTRAP_ADMIN_PASSWORD` | a strong password, 12+ characters |
   | `BOOTSTRAP_ADMIN_NAME` | your name |
   | `BOOTSTRAP_COMPANY_NAME` | your first pilot customer's company name |
   | `SMS_LIVE_SENDING` | `false` for now |

3. Deploy (it fails), then go to **Storage → Create Database → Neon** (a new one), connect it, and **Redeploy**. Same as `DEPLOY.md` Steps 3–4.
4. Open the site, sign in with your email and password, then go to **Settings → Your password** and change it.

> ⚠️ **Vercel Hobby is non-commercial.** Upgrade this project to **Vercel Pro** before you charge customers. It's about $20/month; check current pricing.

## Step 2: Set up the customer's company in CallFlow

1. Go through the **setup wizard** (`/onboarding`): company info, services, service area (add their counties), hours, and team.
2. **Automations page:**
   - Open **Missed Call Recovery** and **Estimate Recovery**. Rewrite the templates in the owner's voice, and **have the owner approve the wording**.
   - Turn **off** anything you're not piloting, such as Review Requests or Appointment Reminders if they don't book appointments in CallFlow.
3. **Settings → Phone & alerts:** leave it for now. You'll fill it in after Step 3.

Each additional customer is added from the company switcher (top-left) → **Add a company**. Each company is fully separate.

## Step 3: Twilio (phone number and texting)

1. **Create an account** at https://www.twilio.com and **upgrade from Trial**. Trial accounts can only text verified numbers and add a "trial" prefix.
2. **Buy a number:** Phone Numbers → Buy a number, with a local area code (801/385 for Utah) and both Voice and SMS enabled. It costs about $1–2/month.
3. **Register for business texting (A2P 10DLC).** US carriers require this for texts from a regular 10-digit number. Unregistered texts get blocked.
   - Twilio Console → **Messaging → Regulatory Compliance / A2P 10DLC**. Follow Twilio's guide there.
   - You're sending texts on behalf of client businesses. Twilio calls this the **ISV** flow, where each client business is registered as its own brand, so follow those steps. You'll need the client's legal business name, EIN and address.
   - **Campaign use case:** customer care / account notifications (mixed is fine).
   - **Sample messages:** copy your approved templates, which include "Reply STOP to opt out".
   - **How customers opt in:** "Customers call the business or request an estimate and receive texts about their own call or estimate. Every message allows STOP."
   - Approval takes days to a few weeks. Fees are small; check Twilio's current prices.
4. **Recommended: turn on Advanced Opt-Out** (Messaging → Services → Opt-Out management). Twilio then handles STOP/HELP replies, and you add `TWILIO_HANDLES_OPT_OUT_REPLY=true` in Vercel so customers don't get two replies.
5. **Point the number at CallFlow:** Phone Numbers → your number.
   - **Voice → A call comes in:** Webhook, `https://YOUR-APP/api/webhooks/twilio/voice`, method POST.
   - **Messaging → A message comes in:** Webhook, `https://YOUR-APP/api/webhooks/twilio/sms`, method POST.
   - The exact URLs are also shown in CallFlow under **Settings → Phone & alerts**.
6. **Add to Vercel** (real app → Settings → Environment Variables), then **Redeploy**:

   | Name | Value |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | from the Twilio Console home page |
   | `TWILIO_AUTH_TOKEN` | from the Twilio Console home page. Keep it secret. |
   | `TWILIO_PHONE_NUMBER` | the number you bought, e.g. `+18015550123` |
   | `APP_URL` | your real app URL, e.g. `https://callflow-app.vercel.app`. Must match exactly, or Twilio's security check fails. |

7. In CallFlow: **Settings → Phone & alerts**
   - **Mode:** Missed-call text-back
   - **Your CallFlow number:** the Twilio number
   - **Staff alert phone:** the owner's or dispatcher's cell
   - **Message callers hear:** adjust as needed. Keep voicemail on.
   - **Quiet hours:** leave 8 PM – 8 AM.
   - Click **Save**.

## Step 4: Forward their missed calls to CallFlow

The company keeps its normal number. Their phone forwards **unanswered or busy** calls to the CallFlow number. This is called *conditional call forwarding*, or *forward on no answer*.
- **Business VoIP systems** (RingCentral, Grasshopper, Comcast Business, Google Voice and similar) usually have a setting like "forward unanswered calls after X rings to…".
- **Cell phones:** most US carriers support conditional forwarding through dial codes or their app. The codes differ by carrier, so call the carrier's support line and ask: *"How do I forward unanswered and busy calls to another number?"*
- **Alternative:** use the **Ring my office first** mode. The CallFlow number becomes the number they publish (Google Business Profile, website, ads). It rings their office, and only texts back if nobody answers.

**Important:** some forwarding setups hide the original caller's number. CallFlow detects this and won't text the company itself, but the test in Step 5 will show it. If it happens, ask the carrier for forwarding that keeps the original caller ID.

## Step 5: Test before going live

1. In Vercel, set `SMS_LIVE_SENDING` = `true` and **Redeploy**. Real texts can now be sent.
2. In CallFlow: **Settings → Phone & alerts → Send test alert**. The alert phone should get a text.
3. **Missed call:** from *your own* cell, call the company's normal number and let it ring out. You should:
   - hear the message and be able to leave a voicemail
   - get a text within about 10 seconds
   - see the owner's alert phone get an alert
   - see the call in CallFlow → **Calls**, and the text in **Inbox**
4. **Reply:** text back "Hi, testing". It appears in **Inbox**, and the owner gets an alert.
5. **Estimate:** Estimates → **Track a sent estimate**, using *your own* number, then **Run automation now**. You get follow-up #1.
6. **Opt-out:** reply **STOP**. You get one opt-out confirmation, CallFlow marks you opted out, and nothing more is sent.
7. If anything fails, see **Troubleshooting** below.

## Step 6: Keep follow-ups running on time

Vercel's free plan runs cron jobs once a day. For timely follow-ups, use the included free GitHub Action. It calls CallFlow every 15 minutes.
1. GitHub → your repo → **Settings → Secrets and variables → Actions**.
2. **Variables tab → New repository variable:** `CALLFLOW_URL` = your real app URL, with no trailing slash.
3. **Secrets tab → New repository secret:** `CALLFLOW_CRON_SECRET` = the real app's `CRON_SECRET`.
4. **Actions tab → CallFlow automations → Run workflow** to test it. It should finish green.

Missed-call text-backs never wait for this; they go out instantly. Quiet hours (8 PM – 8 AM by default) hold scheduled texts until morning.
GitHub pauses scheduled workflows in repos with no activity for 60 days, so commit something occasionally or re-enable it from the Actions tab.

## Step 7: Go live and run the pilot

- **Tell the owner:** "When you miss a call, the customer gets a text right away and you get an alert. Reply from CallFlow or just call them back."
- **Daily:** check **Inbox** and **Dashboard**, and make sure every reply got a human answer.
- **Weekly:** a 5-minute check-in with the owner, and enter the numbers in `sales/lead-tracker.xlsx` → **Pilot results**.
- **Day 30:** show the results (see `sales/05-pricing-and-pilot.md`) and ask to continue on a paid plan.

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Caller hears "an application error has occurred" | Twilio couldn't reach CallFlow. Check the webhook URL in Twilio, and look in Twilio Console → **Monitor → Logs → Errors** for the reason. |
| Twilio errors show 403 | `APP_URL` doesn't exactly match the URL Twilio calls (https, no trailing slash). Fix it and redeploy. |
| No text arrives but CallFlow shows it "Sent" | Usually A2P 10DLC isn't approved yet, or the number isn't attached to the approved campaign. Check Twilio's Messaging logs. |
| Messages show "Simulated" | `SMS_LIVE_SENDING` isn't `true`, or the Twilio variables are missing. Redeploy after changing variables. |
| Missed call shows "own number — no text sent" | Forwarding hides caller ID. Ask the carrier for forwarding that keeps the original number. |
| Staff alerts don't arrive | Set **Staff alert phone** in Settings, then use **Send test alert**. |
| Follow-ups only go out once a day | Set up the GitHub Action (Step 6). |

## Costs for one pilot customer (approximate; check current prices)

- **Twilio number:** about $1–2/month.
- **Texts:** about a cent or less each, plus carrier fees.
- **A2P 10DLC:** a small one-time brand/campaign fee plus a small monthly campaign fee.
- **Voice minutes** for the missed-call message and voicemail: fractions of a cent per minute.
- **Hosting** (shared by all customers): Vercel Pro about $20/month, plus Neon (free tier to start; paid as you grow).

## Go-live checklist

- [ ] Owner replied "yes" to your pilot email (see `sales/05-pricing-and-pilot.md`)
- [ ] Owner approved every template
- [ ] Only people who contacted the business, or gave consent, get texts. "Track a sent estimate" requires confirming consent.
- [ ] STOP works (tested in Step 5)
- [ ] Voicemail and recording disclosure is in the caller message ("You can also leave a message…")
- [ ] `/privacy` and `/terms` pages live with your contact email filled in (Twilio asks for both links)
