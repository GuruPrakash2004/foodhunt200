# Hosting FoodHunt200 privately (Vercel + a free backend)

The page runs on **Vercel**; the API runs as a Docker service on **Render's free plan**. Only numbers you list can sign in, and only with your private access code. Nothing changes for local use (`./run.sh`).

## What you need (all free)
1. A GitHub repo with this code (already `GuruPrakash2004/foodhunt200`).
2. A **Render** account and a **Vercel** account.
3. A free S3-compatible bucket so the free server does not forget your data when it sleeps: **Cloudflare R2** or **Backblaze B2**. Create a bucket and an access key; note the bucket name, endpoint and the two keys.
4. Your NVIDIA key and your Zomato / Swiggy client ids (the same values as in `backend/.env`).

## Steps
1. **Secrets.** Run `cd backend && .venv/bin/python scripts/make_secrets.py`. It prints a JWT secret, a token key and an access code. Keep the access code.
2. **Backend on Render.** New > Blueprint > pick the repo. Render reads `render.yaml`. Fill in every variable marked `sync: false`:
   - `FOODHUNT_ALLOWED_MOBILES`: your 10-digit number (comma-separate to allow more people).
   - `FOODHUNT_PUBLIC_URL`: the Vercel address (step 3). Put a placeholder now and edit it after.
   - the three secrets from step 1, your keys, and the four `LITESTREAM_*` bucket values.
   Note the service address, e.g. `https://foodhunt200-api.onrender.com`.
3. **Frontend on Vercel.** In `frontend/vercel.json` make sure the rewrite points at your Render address. Then from `frontend/`: `npx vercel login`, `npx vercel link`, `npx vercel --prod`. Copy the production URL.
4. **Tell the backend its public address.** Set `FOODHUNT_PUBLIC_URL` on Render to the Vercel URL (no trailing slash) and let it redeploy.
5. **Platform logins.** Add `https://<your-vercel-url>/api/v1/auth/platform/zomato/callback` and `.../swiggy/callback` as allowed redirect addresses in each platform's developer dashboard (Swiggy needs this; Zomato may register it automatically). Then sign in to the app and press **Connect** beside each platform in the top bar.

## Good to know
- **Cold starts:** a free Render service sleeps after ~15 minutes idle. The first request afterwards takes up to a minute; the page says so while it waits.
- **Your data:** the database (deals, history, and the encrypted platform logins) is copied to your bucket every few seconds and restored on boot. Without `LITESTREAM_BUCKET` the server still runs but forgets everything on restart.
- **Security:** the session is a signed JWT in an `HttpOnly`, `Secure` cookie for 7 days. Five wrong sign-ins from one address lock it out for ten minutes. The API docs are off. The server will not start if a secret is missing or weak.
- **Rotating access:** change `FOODHUNT_ALLOWED_MOBILES` or `FOODHUNT_ACCESS_CODE` on Render; a number removed from the list loses access on its next request. Changing `FOODHUNT_JWT_SECRET` signs everyone out.
