# Put the CallFlow AI demo online (step by step)

This guide gives you a public link, like `https://callflow-ai.vercel.app`, that you can send to HVAC companies. No coding is needed; everything happens in your web browser.

**You will use two free services:**
- **Vercel:** runs the website.
- **Neon:** the database that stores the demo data. You create it from inside Vercel.

**Time needed:** about 15 minutes.

> ℹ️ Your portfolio website (GitHub Pages) is not affected by any of this.

---

## Step 0: Merge the code into `main`

Vercel publishes whatever is on your `main` branch.

1. Open https://github.com/Mujtaba-Waqas/Mujtaba-Waqas.github.io/pulls
2. Open the pull request **"Add CallFlow AI…"**.
3. Scroll down and click **Merge pull request**, then **Confirm merge**.

## Step 1: Create a Vercel account

1. Go to https://vercel.com/signup
2. Choose **Hobby** (free) and click **Continue with GitHub**.
3. Sign in as **Mujtaba-Waqas**, the account that owns the repository, and allow access.

## Step 2: Import the project

1. On the Vercel dashboard click **Add New… → Project**.
2. Find **Mujtaba-Waqas.github.io** and click **Import**.
   - If you don't see it, click **Adjust GitHub App Permissions** and give Vercel access to that repository.
3. On the **Configure Project** screen:
   - **Project Name:** `callflow-ai`. This becomes your link: `callflow-ai.vercel.app`. If the name is taken, pick another.
   - **Framework Preset:** Next.js (detected automatically).
   - **Root Directory:** click **Edit** and choose the **`callflow-ai`** folder. ⚠️ This step is important.
   - Leave the Build and Output settings alone. The project's `vercel.json` handles them.
4. Open **Environment Variables** and add these three, one at a time:

   | Name | Value |
   |---|---|
   | `PUBLIC_DEMO` | `true` |
   | `DEMO_LOGIN_ENABLED` | `true` |
   | `CRON_SECRET` | any long random text, 32+ characters (e.g. mash the keyboard or use a password generator). Keep it private. |

5. Click **Deploy**.

> 🟠 **The first deploy is expected to fail** with "No database configured". That's normal: you add the database next.

## Step 3: Add the database (Neon)

1. In your new Vercel project, open the **Storage** tab.
2. Click **Create Database**, choose **Neon** (Serverless Postgres), and click **Continue**.
3. Accept the defaults:
   - **Region:** Washington, D.C. (iad1) is fine.
   - **Plan:** Free.
4. Click **Create**.
5. When asked which environments to connect, keep all of them checked and click **Connect**.
   - This automatically adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to your project.

## Step 4: Redeploy

1. Open the **Deployments** tab.
2. On the failed deployment click **⋯ → Redeploy**, then **Redeploy** again.
3. Wait 2–4 minutes. The build log shows these steps:
   1. `prisma migrate deploy`, which creates the tables
   2. `Seeded Summit Peak HVAC`, which loads the demo data
   3. `next build`, which builds the website
4. When it says **Ready**, click **Visit**.

## Step 5: Try it

1. Open your link and click **Sign in with demo account**.
2. Go to **Calls → Open call simulator → After-hours AC emergency → Place simulated call**, and click **Say** a few times.

🎉 That's the link you send to companies.

---

## What happens automatically

- **Every push to `main` redeploys** the site with fresh demo data.
- **Every night (around 3 AM Utah time)** Vercel calls `/api/cron/reset-demo`. It wipes whatever visitors changed and rebuilds the demo, so the dates always look current.
  - You can see this under **Settings → Cron Jobs**.
  - On the free plan, cron jobs run at most once a day.
- **Nothing real is ever contacted.** Calls and texts are simulated, and the site shows a "Public demo" banner.

## Personalise your sales pages

Your site now has three things to share:
- **Marketing page:** `/`
- **Live demo:** `/login`
- **Printable one-pager:** `/one-pager` (click "Save as PDF")

To show your own contact details on them, add these environment variables in **Settings → Environment Variables**, then redeploy:

| Name | Example |
|---|---|
| `FOUNDER_NAME` | `Mujtaba Waqas` |
| `CONTACT_EMAIL` | `you@yourdomain.com` |
| `CONTACT_PHONE` | `(801) 555-1234` |
| `BOOKING_URL` | your free Calendly link, e.g. `https://calendly.com/you/20min` |
| `PILOT_OFFER` | (optional) your own offer text |

The scripts and email templates live in [`sales/`](./sales/README.md).

**Privacy Policy and Terms** are at `/privacy` and `/terms`. They show a "Template" notice until a contact email is set. To fill in your details, add `CONTACT_EMAIL` (or `LEGAL_CONTACT_EMAIL`), plus optionally `LEGAL_COMPANY_NAME` (your name works if you're a sole proprietor) and `LEGAL_ADDRESS` (see `.env.example`). Twilio's business-texting registration asks for these two links.

## Optional: your own domain

To use a domain like `demo.callflowai.com`:
1. Buy the domain (Namecheap, Cloudflare or GoDaddy, about $10–15/year).
2. In Vercel open **Settings → Domains → Add** and follow the DNS instructions.
3. Then add an environment variable `APP_URL` = `https://demo.callflowai.com` and redeploy.

## If something goes wrong

| Problem | Fix |
|---|---|
| "No database configured" | Do Step 3, then Step 4 |
| Build error mentioning a missing `package.json` or Next.js not found | Root Directory is wrong. Go to **Settings → General → Root Directory**, set `callflow-ai`, and redeploy |
| "Demo account not found" on login | The seed didn't run. Check the build log, and make sure `DEMO_SEED_ON_DEPLOY` isn't set to `false` |
| Site works but data looks old | Redeploy, or wait for the nightly reset |
| Anything else | Open the failed deployment → **Build Logs**, copy the red error text, and send it to me |

## Costs, and one important rule

- **Vercel Hobby and Neon Free cost $0** for this demo.
- ⚠️ **Vercel's free Hobby plan is for non-commercial use only.** Once you're charging customers or running it for a real company, upgrade to **Vercel Pro (about $20/month)** and a paid Neon plan sized to your usage. Check current prices on their websites.
- A real company's live setup is separate from this public demo. It needs its own deployment with `PUBLIC_DEMO=false`, `DEMO_LOGIN_ENABLED=false`, and real Twilio credentials (see `README.md` → *Production-readiness checklist*).
