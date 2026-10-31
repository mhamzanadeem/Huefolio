# Huefolio deployment runbook

Targets: source on `https://github.com/mhamzanadeem/Huefolio`, static frontend on Vercel, one backend instance on Render. No MongoDB, Cloudinary, database, persistent disk or photo bucket is needed. The repository URL is the configured local remote, not a verified publication of the current source.

## Release prerequisites

1. Grant the GitHub connection access to the intended repository and enable Git writes in a trusted workspace. The current connector returns 404 and Git cannot write `.git/FETCH_HEAD` or `.git/index.lock` here. Application commits now exist locally; verify that they reach remote `main` before deploying.
2. Connect Vercel and Render, or use their authenticated dashboards/CLIs. Do not send account credentials, API keys or admin tokens in chat or Git commands.
3. With registry access, run `npm --prefix backend install`, inspect/commit the generated `backend/package-lock.json`, run `npm --prefix backend audit --omit=dev`, then switch Render/CI installation to `npm ci` when the lockfile is present and reviewed. The present blueprint uses `npm install` because a lockfile could not be generated here.
4. Run the README verification commands. All automated tests use synthetic data and never call the real provider. Resolve failed checks and review [readiness status](HACKATHON-READINESS.md).

## Publish source to GitHub

From a Git-writable checkout on `main`, review the logical groups with `node scripts/commit-and-push.mjs`, then use `node scripts/commit-and-push.mjs --execute` to run release checks, commit and push directly to `main`. The helper does not create a separate branch. The historical `design/` prototype is retained locally but ignored. Never add `.env`, `.qa`, `node_modules`, `.vercel`, logs, selfies or credentials; `.env.example` files contain empty placeholders only.

Push `main` to the configured repository. Confirm on GitHub that `src/`, `backend/`, `scripts/`, `tests/`, `integration/`, README, `render.yaml`, `vercel.json` and `.github/workflows/qa.yml` are present on main. Run the GitHub QA workflow and verify its checks; a local pass is not a GitHub CI pass. Do not use a force push to replace unrelated remote commits.

## Deploy Vercel first in labeled sample mode

Import the repository, root directory `.`, framework preset **Other**, build command `npm run build:vercel`; retain `vercel.json`. Do not override the output directory. Leave `HUEFOLIO_BACKEND_URL` unset for the initial sample deployment. The build produces `.vercel/output/static` and an exact-origin security configuration. No backend code, fixtures or environment files are part of that static output.

Ensure the production deployment is anonymously accessible to judges; Vercel deployment protection must not impose a login on the public demo. Verify the disclosure and Explore sample colors in a signed-out browser. This validates a labeled sample demo only, not genuine analysis. Vercel uses its documented [Build Output API](https://vercel.com/docs/build-output-api).

## Deploy Render disabled, then configure connection

Use `render.yaml` as a Blueprint or create a Node Web Service:

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Node version | `24.18.0` |
| Build | `npm install --omit=dev --no-audit --no-fund` (use reviewed `npm ci` after locking dependencies) |
| Start | `npm start` |
| Health path | `/healthz` |
| Instances | Exactly 1; no autoscaling or persistent disk |

Set `NODE_ENV=production`, `FRONTEND_ORIGINS` to the exact HTTPS Vercel production origin, and initially `YOUCAM_INTEGRATION_ENABLED=false`. Even while disabled, production origins must be configured. Consult [Render's Blueprint reference](https://render.com/docs/blueprint-spec) for provisioning. A healthy backend is not proof that YouCam analysis is ready. Render spin-down/restarts discard runtime jobs; use an appropriate always-running service for a stable judging window. Plan selection and purchase remain with the operator.

Set `HUEFOLIO_BACKEND_URL` on Vercel to the exact Render HTTPS origin, with no trailing slash, and rebuild. Confirm that Render's `FRONTEND_ORIGINS` matches the final frontend origin. Arbitrary preview origins and `*.vercel.app` are not permitted. Keep `YOUCAM_API_KEY` and `HUEFOLIO_ADMIN_TOKEN` exclusively in Render/server/operator environment settings.

## Enable genuine analysis deliberately

Configure all variables in [backend environment reference](../backend/README.md#backend-environment), including the YouCam key, verified exact signed-upload hostnames, a strong server-only admin token, startup reconciliation and a bounded unit allocation. Do not guess upload hosts or allow broad storage wildcards. The documentation's single PUT workflow and actual transfer instructions still need a controlled live check.

After verifying the actual account balance, expiry, prior spending and in-flight tasks, enable analysis and initialize the process budget once using the documented operator tool. Example syntax (the secret is read from the operator environment, never an argument):

```sh
node --env-file-if-exists=.env arm-budget.js 20 https://YOUR-RENDER-SERVICE.onrender.com
```

Run from `backend/`. The value 20 is a deliberately small initial live-test allocation, not a claim about current account balance. A successful Facial Color Tones task is budgeted at the [documented 20 units](https://docs.perfectcorp.com/reference/ai_skin_tone_analysis/section/overview/unit-consumption); inspect the provider console and current pricing before allocating. A later restart/redeploy requires fresh reconciliation; do not repeatedly reset the release allowance. The application never automatically retries a paid task creation.

## Public and live verification

Once the real URLs exist, run the anonymous read-only check:

```sh
node scripts/public-smoke.mjs https://YOUR-FRONTEND.vercel.app https://YOUR-BACKEND.onrender.com
```

Use `--allow-sample` only when explicitly accepting the labeled example demo while analysis is disabled. This check reads landing assets, public backend configuration, health and exact-origin CORS. It sends no photo and starts no paid task; it cannot certify browser behavior or genuine results.

In an anonymous browser, test all eight routes at mobile and desktop sizes. Confirm consent is initially unchecked, replacing a photo clears consent, navigation causes no new analysis POST, and only Continue to analysis sends the photo. Use a test selfie with the subject's consent, acknowledge the visible provider terms, and submit once. Confirm registration → signed PUT → task creation → polling → actual result normalization, missing-field behavior and provider cleanup. Inspect the provider console for actual unit usage without logging images, keys, signed URLs or raw responses.

Check color profile, palette/Why this color, multiple kept colors, all six occasions, card/palette/combination downloads, readable controls, native leave warning where supported, Keep exploring, Start over, Exit and a fresh session after reload. Verify public error states without generating unnecessary paid requests. Record the URLs, source revision, deployment IDs, test date, browser/device, redacted outcome and actual consumed units in the readiness document. Do not call the submission fully ready before these checks pass.

## Failure and rollback

If the backend, credits or provider workflow fails, disable connected analysis; the labeled sample workspace remains usable. Rebuild the frontend if its backend origin changes. Restore a known verified deployment through the provider dashboard if necessary, then reconcile remaining credits before enabling the restarted backend. Do not switch to fabricated personal results, broaden upload-host/CORS allowlists, store photos, or expose credentials to recover a demo.
