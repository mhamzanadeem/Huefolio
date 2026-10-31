# Huefolio

Your colors. Your identity. Your style.

Personal color discovery using YouCam Facial Color Tones analysis, transparent palette calculations, color comparisons, occasion combinations and browser-generated downloads. No accounts, database, permanent photo storage, medical advice, attractiveness scores or Virtual Try-On.

Built for the YouCam API Hackathon using API credits provided for hackathon development. This is an independent project, without a claim of Perfect Corp. endorsement.

## Run locally

Use **Node.js 24 LTS**. Electron is not required: the frontend runs in a browser and the backend runs in a separate Node.js terminal.

For sample colors only:

```powershell
cd C:\Huefolio
npm run dev
```

Open http://127.0.0.1:4173 and select **Explore sample colors**. No backend, photo or API key is needed for this clearly labeled example mode. Stop a terminal process with Ctrl+C.

For the backend, in a separate PowerShell terminal:

```powershell
cd C:\Huefolio
npm --prefix backend install
if (!(Test-Path backend/.env)) {
  Copy-Item backend/.env.example backend/.env
}
npm run backend
```

For the frontend connected to that backend, in another terminal:

```powershell
cd C:\Huefolio
$env:HUEFOLIO_BACKEND_URL = "http://127.0.0.1:10000"
npm run build
node serve.mjs --dist
```

Open http://127.0.0.1:4173. Analysis remains disabled until the server configuration and startup budget are ready. The frontend receives only the public backend URL. Its build does not automatically load `.env`; either set the shell variable above or run `node --env-file-if-exists=.env build.mjs --vercel`.

## Server environment

Put secrets only in `backend/.env` locally or Render's server environment. Never put them in Vercel, browser code, Git or command arguments.

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port, default 10000 |
| `NODE_ENV` | `development` locally, `production` on Render |
| `YOUCAM_INTEGRATION_ENABLED` | Starts as `false`; enable only after configuration |
| `YOUCAM_API_KEY` | Server-only provider credential |
| `YOUCAM_UPLOAD_HOSTS` | Exact provider-verified signed-upload hosts; no wildcards |
| `FRONTEND_ORIGINS` | Exact allowed browser origins; HTTPS in production |
| `HUEFOLIO_ADMIN_TOKEN` | Server-only administration secret, at least 32 random characters |
| `HUEFOLIO_RECONCILE_ON_START` | Keep `true`; requires budget reconciliation after every start |
| `HUEFOLIO_API_BUDGET_UNITS` | Process allocation cap; default 800, not proof of account balance |
| `HUEFOLIO_MAX_CONCURRENT_ANALYSES` | Maximum concurrent workers; default and maximum 2 |

Before enabling analysis, verify provider upload hosts, actual remaining credits and in-flight usage. Initialize the process allocation once per start from `backend/`, with the admin token in the operator environment:

```sh
node --env-file-if-exists=.env arm-budget.js 20 https://YOUR-RENDER-SERVICE.onrender.com
```

The example allocation of 20 is for a bounded initial test, not a statement of account balance. Never blindly reallocate credits after a restart. Paid task creation is not automatically retried.

## Deployment

Frontend: Vercel, repository root, framework Other, `npm run build:vercel`, existing `vercel.json`. It generates `.vercel/output/static`; do not override the output directory. Set only `HUEFOLIO_BACKEND_URL` to the exact Render HTTPS origin and rebuild. Judges must be able to visit without a hosting-provider login.

Backend: Render, use `render.yaml` or root directory `backend`, build `npm install --omit=dev --no-audit --no-fund`, start `npm start`, health path `/healthz`, one instance, no persistent disk. Set the matching exact frontend origin and server settings above. A healthy service can still be waiting for budget reconciliation. An always-running service is preferable for judging; restarts discard memory and require reconciliation.

## API and privacy

The server validates JPG/PNG magic bytes, file size under 9,500,000 bytes, single-frame decoding and dimensions from 320 to 4096 pixels. Sharp re-encodes in memory and strips metadata. Explicit photo consent is required before transmission.

The official workflow is file registration, signed PUT transfer, Facial Color Tones task creation, status polling, normalization of documented color values, and a best-effort finished-task deletion request. The provider key and signed upload URL stay on the server. Skin/eye/lip/eyebrow/hair values and available eye/hair names are kept separate from Huefolio HSL/OKLab calculations and user choices. Missing measurements are never replaced with invented results.

Photo/results stay in temporary application memory. No MongoDB, Cloudinary, cookies, localStorage or IndexedDB store personal analysis. Exit, Start over, reload and session expiry clear local results; downloads are explicit copies kept on the user's device. Native leave warnings depend on the browser and cannot intercept every close. YouCam processing follows its applicable terms and documented retention policy; Huefolio does not promise immediate third-party deletion. Backend result copies are released after transfer where possible, or expire after at most 15 minutes.

## Repository contents

Keep `src/`, backend runtime code, `build.mjs`, `serve.mjs`, package manifests, environment templates and Vercel/Render configuration in Git.

`scripts/`, `integration/`, `docs/`, `design/`, `tests/`, `backend/test/`, the developer QA workflow and generated output are local-only and ignored. They are not required by the published website. The essential build/server helpers live at the repository root, so building and starting a fresh clone does not depend on the ignored `scripts/` folder. Ignoring files does not delete local copies or automatically untrack files already in Git.

## Verification status

The earlier local QA run passed 39 unit/integration tests plus mocked Chromium journeys; one socket test was skipped because the execution environment blocked loopback access. Development tests/tools remain locally available but are excluded from the runtime repository. These results do not certify a genuine provider call, current dependency vulnerabilities, public deployment, production latency or a complete accessibility audit. Verify a consented live analysis and anonymous judge access after deployment. No current public demo or genuine YouCam result is claimed here.
