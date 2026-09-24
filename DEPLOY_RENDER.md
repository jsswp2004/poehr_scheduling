# Deploying the Showcase Backend to Render

This sets up the Django API as a **free/low-cost public demo** — no Azure,
no real Stripe charges, no real Twilio texts, fake seeded patients.

## What's already done (in this repo)

- `poehr_scheduling_backend/settings_render.py` — Render-specific Django settings
  (env-driven ALLOWED_HOSTS/CORS, WhiteNoise for static files, in-memory
  channel layer so no Redis add-on is needed, DEMO_MODE flag).
- `render.yaml` — a Render "Blueprint" that provisions the web service + a
  free Postgres database automatically.
- `requirements.txt` — added `whitenoise`.
- `appointments/management/commands/seed_demo_data.py` — creates a fake
  clinic, 2 fake doctors, 6 fake patients, and ~3 weeks of fake appointments.

## Steps on Render's site (you do these — I can't sign up for you)

1. **Push these changes to GitHub** (I can do this part if you want — just say go).
2. Go to **render.com** → sign up / log in (free, no card required for the free tier).
3. Click **New +** → **Blueprint**.
4. Connect your GitHub account and pick the `poehr_scheduling` repo.
5. Render reads `render.yaml` automatically and shows you:
   - A **web service**: `poehr-scheduling-api`
   - A **Postgres database**: `poehr-scheduling-db`
6. Click **Apply** / **Create**. It will build and deploy — first build takes
   a few minutes (installs everything, runs `migrate`).
7. Once it's live, Render gives you a URL like
   `https://poehr-scheduling-api.onrender.com`.

## After first deploy — seed the fake demo data

In the Render dashboard, open the web service → **Shell** tab, and run:

```
python manage.py seed_demo_data
```

This prints demo logins, e.g.:

```
Login as admin:    demo_admin / DemoPass123!
Login as a doctor: dr_amara_chen / DemoPass123!
Login as a patient: patient_taylor_whitfield / DemoPass123!
```

## Known limitations of this demo setup (by design, to keep it free/safe)

- **Cold starts**: Render's free web service spins down after ~15 minutes of
  no traffic. The first request after idle takes ~30-50 seconds to wake up.
  Fine for a showcase; mention it if you're demoing live to someone.
- **Free Postgres expires**: Render's free database plan is time-limited
  (currently ~30 days) and then needs to be recreated or upgraded to the
  paid Starter tier (~$7/mo) if you want it to persist longer. Fine for a
  short showcase window; upgrade only if you keep using it.
- **No real-time chat across restarts**: chat uses an in-memory channel
  layer instead of Redis, so it works while the instance is running but
  resets on restart/redeploy. Not needed for a static showcase.
- **Stripe/Twilio buttons won't work**: no live keys are set in Render, so
  billing/SMS actions will fail safely (no charges, no texts) rather than
  being silently disabled in the UI. That's intentional for demo mode.

## One more thing worth doing regardless of hosting

Your repo's `.env.production` has a **live Stripe publishable key**
checked into git history. Publishable keys are meant to be public
(they can't move money on their own), so this isn't a secret leak — but
if you ever add the **live Stripe secret key** to a public repo, rotate it
immediately in the Stripe dashboard. Worth a quick check that no secret
(`sk_live_...`) is anywhere in git history.

## Next step after this works

Once the API is live at `https://poehr-scheduling-api.onrender.com`, we set
`REACT_APP_API_URL` on Vercel to that address so the frontend (deployed
next) actually talks to it, instead of the dead Azure URLs currently
hardcoded in `src/config/api.js`.
