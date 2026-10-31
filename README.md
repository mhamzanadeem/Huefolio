# Huefolio

Your colors. Your identity. Your style.

Personal color discovery using YouCam Facial Color Tones analysis, transparent palette calculations, color comparisons, occasion combinations and browser-generated downloads. No accounts, database, permanent photo storage, medical advice, attractiveness scores or Virtual Try-On.

The Results page links to **Outfit & Makeup Ideas** (`#/style`). A user-selected Male/Female style profile filters 27 outfit templates plus a custom-outfit option: two/three-piece suits, tuxedos, dresses, jumpsuits, trouser/skirt suits, casual and traditional separates. Automatic recommendations choose three garment combinations for the occasion; choosing a fixed outfit generates three distinct color arrangements. All six occasions have different assignment recipes. Country context covers 193 UN members plus the Holy See and Palestine (195 choices); curated local garment examples currently cover Pakistan, Japan, South Korea and Morocco, with source links on the relevant cards. Other countries explicitly offer international options and custom garment names, rather than claiming complete national-dress coverage. Gender and country are never inferred from a photo. Makeup can be disabled or set to minimal, soft or statement; each of three kits includes lip color, blush, eyeshadow, eyeliner and a nail accent, with saturation varying by occasion and preference. Outfit colors come from the active workspace; makeup uses disclosed OKLab reference selection and HSL recipes. These are application-generated ideas, not verified flattering shades or API styling classifications. Copying and individual color-board PNG downloads run locally without analysis requests. Preferences and custom garment names clear with the temporary session.

Built for the YouCam API Hackathon using API credits provided for hackathon development. This is an independent project, without a claim of Perfect Corp. endorsement.

## Run locally

Use **Node.js 24 LTS**. Electron is not required: the frontend runs in a browser and the backend runs in a separate Node.js terminal.

For sample colors only:

```powershell
cd C:\Huefolio
npm run dev
```

Open http://127.0.0.1:4173 and select **Explore sample colors**. No backend, photo or API key is needed for this clearly labeled example mode. Stop a terminal process with Ctrl+C.

Judges can also use **Choose an AI-generated test portrait** on the landing page, or the dropdown at the top of the photo page. Four fictional adult portraits are bundled in `assets/judge/`; each loads only after selection. Preview or download a portrait, agree to YouCam processing, then click Continue to analysis. Selecting a portrait never automatically sends it to the backend or consumes an analysis task. Replacing it clears consent.

These bundled synthetic images are public demonstration assets, not stored user selfies or precomputed personal results. Genuine analysis still requires configured/available YouCam service and API credits. Provider face-quality checks may reject a synthetic portrait. Results, cards and exports keep the AI-generated input label separate from API measurements and Huefolio calculations. The separate Explore sample colors flow remains a clearly labeled no-API option.

For the backend, in a separate PowerShell terminal:

```powershell
cd C:\Huefolio
npm --prefix backend install
if (!(Test-Path backend/.env)) {
  Copy-Item backend/.env.example backend/.env
}
npm run backend
```

For this local setup, `backend/.env` contains the private YouCam settings and a generated local admin token; root `.env` contains only the public localhost URL and frontend port. Both files are ignored by Git. Enter your key only in `backend/.env`, not in `.env.example` or root `.env`. Existing files should not be overwritten when setting up again.

For the frontend connected to that backend, in another terminal:

```powershell
cd C:\Huefolio
npm run dev
```

Open http://127.0.0.1:4173. `npm run dev` loads the root `.env`, builds the configured frontend and starts its local server. `npm run build` and `npm run build:vercel` also load that file when present. Analysis remains disabled until the server configuration and startup budget are ready. The frontend receives only the public backend URL.

To activate genuine local analysis, keep your key in `backend/.env` and run `npm --prefix backend run setup:local` with network access. This verifies the v2 key, registers only metadata for a generated blank test image, reads the exact signed-upload hostname returned by YouCam and validates its destination. It sends no image bytes, creates no analysis task and does not initialize a spending budget. After successful checks it updates only `YOUCAM_UPLOAD_HOSTS` and `YOUCAM_INTEGRATION_ENABLED=true`, preserving your credentials. Failed verification leaves the environment unchanged. Empty file-registration metadata may remain at the provider; no photo is uploaded by this setup step.

If setup fails, its diagnostic line identifies the step (`credential-check`, `file-registration` or upload-host validation), the HTTP status when available, and a fixed response-format category. HTTP 401 means authentication was rejected; HTTP 403 means access was denied and may require checking provider permissions or a network filter. `PROVIDER_RESPONSE` means the response could not be parsed or did not match the expected file schema; it does not establish that a credential is missing or invalid. Share only the diagnostic line when troubleshooting, never environment contents, raw provider responses or signed URLs. Setup reads `backend/.env`; the root `.env` configures the frontend.

Restart the backend after setup so it loads the updated environment. The only third-party API credential required is the YouCam key; the upload-host setting is a destination allowlist, not another key. Do not guess it. With valid enabled configuration, `npm run backend` initializes the configured process budget automatically and reports `Analysis ready`. No separate initialization command is needed. Startup does not contact YouCam, upload a photo or start a paid task.

The local configuration caps the first test at 20 units and one concurrent analysis. `HUEFOLIO_API_BUDGET_UNITS` is an application allowance for each backend process, not a live reading of the provider account balance. The allowance resets on backend restart; provider credit and rate limits still apply. Photo transmission requires the in-app consent action. Leave analysis disabled to test the sample journey while the real provider settings are incomplete.

If the photo page reports that live analysis is switched off, run the setup command above and restart the backend. If it says the operator budget is needed, check for an old running backend and ensure `HUEFOLIO_RECONCILE_ON_START=false` in `backend/.env`, then restart it. If it cannot reach the backend, check that `npm run backend` is running on port 10000 and root `.env` points there. Then use **Check connection again** on the photo page: this checks only readiness, preserves your selected image/consent, and never submits a new analysis task.

## YouCam authentication and request limits

The current [YouCam quick-start guide](https://docs.perfectcorp.com/develop/quick_start_guide) authenticates the `/s2s/v2.0/` Facial Color Tones workflow with `Authorization: Bearer YOUR_API_KEY`. A separate console `YOUCAM_SECRET_KEY` is not transmitted, signed or concatenated into v2 requests. You may keep it privately in `backend/.env`; it is not a required v2 credential. Other Perfect Corp. products/older authentication flows are not interchangeable with these endpoints.

To check key acceptance without uploading a photo or starting an analysis task, run:

```powershell
cd C:\Huefolio
npm --prefix backend run verify:youcam
```

This operator command calls the documented read-only v2 feature-cost endpoint and never prints credentials or response bodies. A successful check is not an end-to-end analysis test. A connection failure does not prove the key is invalid.

The provider's [rate-limit documentation](https://docs.perfectcorp.com/develop/rate_limit) specifies 250 requests per 300 seconds, per IP address and per access token. Both apply. Huefolio defaults to a conservative rolling cap of 200 API requests per 300 seconds and spaces request starts by at least 250ms (4/second). All API registration, task, polling and cleanup operations share this single backend gate. `429` responses activate a shared cooldown and honor `Retry-After`; paid task creation is never automatically replayed. Local browser status checks are not forwarded one-for-one to YouCam.

`YOUCAM_REQUEST_LIMIT` may lower the cap or raise it to at most 250. Keep it at 200 for headroom. This is an in-memory, single-process limiter, not an account-wide coordinator: other applications sharing the key or outbound IP consume the same provider allowance. Do not scale the backend across instances without a shared limiter. Signed storage PUTs are kept separate and never receive the API key.

## Server environment

Put secrets only in `backend/.env` locally or Render's server environment. Never put them in Vercel, browser code, Git or command arguments.

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port, default 10000 |
| `NODE_ENV` | `development` locally, `production` on Render |
| `YOUCAM_INTEGRATION_ENABLED` | Starts as `false`; enable only after configuration |
| `YOUCAM_API_KEY` | Server-only provider credential |
| `YOUCAM_SECRET_KEY` | Optional private console secret; not used by current v2 requests |
| `YOUCAM_REQUEST_LIMIT` | Rolling request cap per 300 seconds; default 200, maximum 250 |
| `YOUCAM_UPLOAD_HOSTS` | Exact provider-verified signed-upload hosts; no wildcards |
| `FRONTEND_ORIGINS` | Exact allowed browser origins; HTTPS in production |
| `HUEFOLIO_ADMIN_TOKEN` | Server-only administration secret, at least 32 random characters |
| `HUEFOLIO_RECONCILE_ON_START` | Default `false`: initialize the configured allocation automatically; `true` opts into manual mode |
| `HUEFOLIO_API_BUDGET_UNITS` | Process allocation cap; default 800, not proof of account balance |
| `HUEFOLIO_MAX_CONCURRENT_ANALYSES` | Maximum concurrent workers; default and maximum 2 |

Normal startup initializes the configured allocation automatically. It does not query or increase your YouCam account balance. For deployments that specifically need operator approval, optionally set `HUEFOLIO_RECONCILE_ON_START=true` and initialize the allocation once per start from `backend/`, with the admin token in the operator environment:

```sh
node --env-file-if-exists=.env arm-budget.js 20 https://YOUR-RENDER-SERVICE.onrender.com
```

The example manual allocation of 20 is for a bounded initial test, not a statement of account balance. Budget tracking is per process and resets on server restart; choose the configured cap with your provider balance in mind. Paid task creation is not automatically retried.

## Deployment

Frontend: Vercel, repository root, framework Other, `npm run build:vercel`, existing `vercel.json`. It generates `.vercel/output/static`; do not override the output directory. Set only `HUEFOLIO_BACKEND_URL` to the exact Render HTTPS origin and rebuild. Judges must be able to visit without a hosting-provider login.

Backend: Render, use `render.yaml` or root directory `backend`, build `npm install --omit=dev --no-audit --no-fund`, start `npm start`, health path `/alive`, one instance, no persistent disk. Set the matching exact frontend origin and server settings above. Automatic budget initialization is the default, including in `render.yaml`. On an existing Render service, change any old `HUEFOLIO_RECONCILE_ON_START=true` setting to `false` to use automatic mode. Restarts discard active sessions and reset the configured process allowance.

### Deployment environment values

On Vercel, set only the public build variable `HUEFOLIO_BACKEND_URL=https://YOUR-SERVICE.onrender.com` (exact origin, no trailing slash) and redeploy after setting it. Keep the root directory at the repository root and use branch `main` with `npm run build:vercel`. The build generates Vercel's output configuration; do not override the output directory.

On Render, use root directory `backend`, branch `main`, build `npm install --omit=dev --no-audit --no-fund`, start `npm start`, and these environment values:

```dotenv
NODE_ENV=production
NODE_VERSION=24.18.0
YOUCAM_INTEGRATION_ENABLED=true
YOUCAM_API_KEY=<your YouCam v2 API key>
YOUCAM_UPLOAD_HOSTS=<copy the verified host list from backend/.env>
FRONTEND_ORIGINS=https://YOUR-PROJECT.vercel.app
HUEFOLIO_ADMIN_TOKEN=<a private random string of at least 32 characters>
HUEFOLIO_RECONCILE_ON_START=false
HUEFOLIO_API_BUDGET_UNITS=800
YOUCAM_REQUEST_LIMIT=200
HUEFOLIO_MAX_CONCURRENT_ANALYSES=2
```

The 800-unit value is a configurable allowance per backend run, not an account-balance check. Render supplies `PORT`; the application defaults to `10000`. The Blueprint generates the admin token automatically; for manual dashboard setup, copy your existing private token or generate a new one. `YOUCAM_SECRET_KEY` is not needed for these v2 requests. Use exact frontend origins, without trailing slashes; multiple approved production/preview origins can be comma-separated. Keep credentials on Render. All four static `assets/judge/portrait-*.png` images are required source assets and are copied into the Vercel build.

### Backend heartbeat

`GET /alive` returns `{ "status": "alive" }`, supports the configured frontend origins, and requires no authentication. It calls no YouCam endpoint, initializes no budget, and returns no session information. The frontend calls it immediately and then every 30 seconds while the page runs, with no credentials or photos. Requests never overlap, time out after 25 seconds and stop on page exit; restoring a cached page resumes the timer. After a successful heartbeat, an unreachable backend's capabilities can be rechecked automatically. Failed pings are quiet and do not submit analysis tasks.

[Render's free-service documentation](https://render.com/docs/free) describes spin-down after 15 minutes without inbound traffic, and wake-up on subsequent requests. Browser heartbeats provide traffic while a visitor keeps the page running; they are not an always-on guarantee. Background tabs can be throttled or suspended, and closing all tabs stops the heartbeat. Free-tier limits and platform restarts still apply.

## API and privacy

The server validates JPG/PNG magic bytes, file size under 9,500,000 bytes, single-frame decoding and dimensions from 320 to 4096 pixels. Sharp re-encodes in memory and strips metadata. Explicit photo consent is required before transmission.

The official workflow is file registration, signed PUT transfer, Facial Color Tones task creation, status polling, normalization of documented color values, and a best-effort finished-task deletion request. The provider key and signed upload URL stay on the server. Skin/eye/lip/eyebrow/hair values and available eye/hair names are kept separate from Huefolio HSL/OKLab calculations and user choices. Missing measurements are never replaced with invented results.

Photo/results stay in temporary application memory. No MongoDB, Cloudinary, cookies, localStorage or IndexedDB store personal analysis. Exit, Start over, reload and session expiry clear local results; downloads are explicit copies kept on the user's device. Native leave warnings depend on the browser and cannot intercept every close. YouCam processing follows its applicable terms and documented retention policy; Huefolio does not promise immediate third-party deletion. Backend result copies are released after transfer where possible, or expire after at most 15 minutes.

## Repository contents

Keep `src/`, `assets/judge/`, backend runtime code, `build.mjs`, `serve.mjs`, package manifests, environment templates and Vercel/Render configuration in Git.

`scripts/`, `integration/`, `docs/`, `design/`, `tests/`, `backend/test/`, the developer QA workflow and generated output are local-only and ignored. They are not required by the published website. The essential build/server helpers live at the repository root, so building and starting a fresh clone does not depend on the ignored `scripts/` folder. Ignoring files does not delete local copies or automatically untrack files already in Git.

## Verification status

The earlier local QA run passed 39 unit/integration tests plus mocked Chromium journeys; one socket test was skipped because the execution environment blocked loopback access. Development tests/tools remain locally available but are excluded from the runtime repository. These results do not certify a genuine provider call, current dependency vulnerabilities, public deployment, production latency or a complete accessibility audit. Verify a consented live analysis and anonymous judge access after deployment. No current public demo or genuine YouCam result is claimed here.
