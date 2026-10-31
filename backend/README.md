# Huefolio backend — Render

Memory-only YouCam Facial Color Tones Analyzer integration. It uses the official file registration → signed image transfer → asynchronous task → polling → normalized result → finished-task deletion workflow. The separate Face Attributes, Skin Analysis, and Virtual Try-On APIs are not called.

The frontend retains the approved layout. Its only new public configuration is the Render service URL; **never put a YouCam key or administration token in Vercel**.

## Install and run locally

Use Node 24 LTS (minimum 22.12) and a supported Sharp platform. From the repository root:

```sh
npm install --prefix backend
```

Copy `backend/.env.example` to `backend/.env`, configure it locally, then:

```sh
npm run backend
```

The backend listens on `0.0.0.0`, `PORT` (default 10000). It serves JSON endpoints only; it never serves `.env`, fixtures, source files or images. The server runs without credentials with analysis disabled; `/healthz` still responds. Enabling analysis without required settings fails startup without printing those settings.

For a local frontend, set the public build environment `HUEFOLIO_BACKEND_URL=http://127.0.0.1:10000`, run `npm run build`, then `node scripts/serve.mjs --dist`. Open `http://127.0.0.1:4173`. Add that exact origin to the backend allowlist. The sample workspace remains available when the backend is unavailable or disabled. Environment variables are not automatically loaded by the frontend build: set them in your shell or Vercel build settings.

## Backend environment

| Variable | Required / default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` on Render | Production requires HTTPS frontend origins and per-start budget reconciliation |
| `PORT` | Render supplies it; local 10000 | Listener port |
| `YOUCAM_INTEGRATION_ENABLED` | `false` | Explicitly enables paid analysis; missing credentials never trigger sample provider responses |
| `YOUCAM_API_KEY` | Required when enabled | **Server secret**, sent only to `https://yce-api-01.makeupar.com` |
| `YOUCAM_UPLOAD_HOSTS` | Required when enabled | Comma-separated exact HTTPS signed-upload DNS hostnames verified with YouCam; no wildcard, scheme, port or path |
| `FRONTEND_ORIGINS` | Required in deployment | Comma-separated exact Vercel/custom-domain origins, no trailing slash, no wildcard; local defaults include localhost/127.0.0.1:4173 |
| `HUEFOLIO_ADMIN_TOKEN` | Required when enabled, 32+ random characters | **Server/operator secret** for initializing budget, never a visitor credential |
| `HUEFOLIO_RECONCILE_ON_START` | `true` | Connected analysis stays unavailable after each process start until operator reconciliation; production cannot disable this |
| `HUEFOLIO_API_BUDGET_UNITS` | 800, max 1000 | Maximum process allocation, not proof of provider balance |
| `HUEFOLIO_MAX_CONCURRENT_ANALYSES` | 2, maximum 2 | Bounds upload/decode/provider workers |

The provider API base URL is fixed. An obsolete `YOUCAM_API_BASE_URL` value, if supplied, must match the official host. No user may supply a provider URL, endpoint, feature list, file ID, task ID, callback URL or strictness override.

### Signed-upload hosts must be verified

The public file contract gives an example URL rather than an actual destination hostname. Obtain the exact upload hostnames from the provider or an explicitly authorized controlled registration preflight; do not guess them or use `*.amazonaws.com`. This build accepts the documented single-request `PUT` upload flow. It fails closed on other transfer instructions instead of guessing chunking semantics or forwarding arbitrary headers.

URLs must use HTTPS/443 with no embedded credentials; DNS results must all be public. The HTTPS connection pins a checked address while retaining certificate/hostname validation. Redirects are not followed. Only narrow upload headers are accepted, and the YouCam `Authorization` header is never forwarded to storage. Signed URLs are not returned to the browser or logged. Unknown response envelopes or storage hosts require review before traffic is enabled.

## Deploy on Render

Use the repository's `render.yaml` Blueprint or create a Node Web Service with:

- Root directory: `backend`
- Build command: `npm install --omit=dev --no-audit --no-fund`
- Start command: `npm start`
- Health check: `/healthz`
- One instance; no autoscaling, workers or persistent disks
- Configure the variables above in Render environment settings, not source control

Start with `YOUCAM_INTEGRATION_ENABLED=false`. Configure credentials, exact Vercel origins, verified signed-upload hosts and the administration token, then enable. A running service can be healthy while awaiting budget reconciliation.

Use an always-running service for ongoing analyses. Render free services can spin down; restarts discard in-memory sessions and cleanup metadata. The application requires no database, MongoDB, Cloudinary, object storage, disk mounts or user-record persistence. Render's supported service binding and ephemeral-runtime limitations are documented in [web services](https://render.com/docs/web-services) and [free instances](https://render.com/docs/free). No deployment, plan purchase or provider call is performed by these configuration files.

### Budget initialization after EVERY start/deploy

The app cannot preserve a global lifetime spend counter without persistence. It therefore **fails closed** on each restart. Check actual YouCam usage/balance/expiry in the console, subtract other spending and ambiguous in-flight tasks, and allocate only the remaining release allowance. Do not blindly reallocate 800 after every restart.

From an operator machine, place the same admin token in an environment variable or a protected local `.env` (never command arguments), then run from `backend/`:

```sh
node --env-file-if-exists=.env arm-budget.js 800 https://YOUR-RENDER-SERVICE.onrender.com
```

Replace 800 with the reconciled remaining allocation, at most the configured process cap. The tool calls `POST /internal/budget` with `{ "remainingUnits": 800 }`; the admin token is sent in `X-Admin-Token`, with no browser Origin. This can succeed only once per process. This endpoint is not exposed by the frontend or allowed through browser CORS. Restrict it further at the edge where possible. Protect operator requests from body/header logging as well.

Each new analysis reserves 20 units synchronously. Definitive task rejection and terminal engine failure release the reservation; ambiguous delivery remains charged/reserved. No paid task POST is automatically retried. Polls retry transient failures within a bounded window. CORS is a browser boundary, not bot authentication: public clients can forge Origin outside browsers, so the hard budget, two-worker limit and rate limits remain essential.

## Deploy the frontend on Vercel

Import this repository using the root `vercel.json`, framework preset **Other**. The build command is `npm run build:vercel`; it emits `.vercel/output/static` and Build Output API v3 routes. Do not override the output directory in the dashboard. Only static frontend files are included, never `backend/`, environment files, contracts or fixtures.

Set **only** `HUEFOLIO_BACKEND_URL=https://YOUR-RENDER-SERVICE.onrender.com` in the Vercel build environment. Use the exact HTTPS origin with no trailing slash. Rebuild after changing it. The build embeds that public URL and generates a CSP allowing connections only to self and that backend origin. Set matching `FRONTEND_ORIGINS` on Render. Configure preview origins explicitly only when paid analyses from previews are intended; do not allow arbitrary `*.vercel.app`. The frontend sends image bytes directly over HTTPS to Render, avoiding Vercel function/proxy upload limits. See [Vercel Build Output API](https://vercel.com/docs/build-output-api).

Do not configure `YOUCAM_API_KEY`, `HUEFOLIO_ADMIN_TOKEN`, or any public-prefixed secret in Vercel. The local development server uses a broader Render-host CSP for local testing; production Vercel output generates the exact origin instead.

## API contract

All browser endpoints require an exact allowlisted `Origin`. JSON responses use `Cache-Control: no-store`. CORS allows only GET/POST/DELETE/OPTIONS and named headers; cookies are not used. Queries and unrelated request parameters are rejected.

### `GET /v1/capabilities`

Returns `{ enabled, ready, consentVersion: "youcam-color-v1", maxBytes: 9500000 }`. This contains no secret/account balance. The frontend keeps sending disabled until `ready` is true.

### `POST /v1/analyses`

Send raw binary JPG/PNG bytes, not multipart, base64 JSON, a photo URL, or a filename:

- `Content-Type: image/jpeg` or `image/png`
- `X-Huefolio-Consent: youcam-color-v1` after explicit user agreement
- `X-Request-Id`: fresh random UUID for this request; reused only to recover the same submission
- `Authorization: Bearer <64-random-hex-character-job-token>`

The client generates the token before POST so a lost acknowledgement can be recovered with GET without another paid submission. The server retains only its SHA-256 digest and checks it on all job operations. Repeated request ID/token returns the existing job without uploading or charging again. Reuse with a different token is rejected.

Content length is checked when present; streamed bytes are bounded independently. Raw input and re-encoded buffers are wiped/released after processing/upload in success and error paths. Only one JPEG/PNG frame is accepted, under 9,500,000 bytes, 320–4096px per side, at most 4096² decoded pixels. Sharp decodes real bytes, auto-orients, removes metadata and re-encodes to JPEG in memory. It uses no filename, file output, temp path or application disk cache. EXIF/GPS never goes upstream. The local File is released once submitted/aborted; no browser persistent-storage API is used.

Returns HTTP 202 (or 200 for duplicate) with `{ id, stage, expiresAt, cleanup }`. Image validation and provider work happen in a bounded background job; errors appear in status, and no provider operation occurs if decoding fails.

### `GET /v1/analyses/:id`

Requires the same bearer job token. Returns stage `receiving`, `validating`, `uploading`, `submitting`, `processing`, `timed_out`, `success`, `error`, or `cancelled`. No fake percentage. Successful example below uses **synthetic values**, not an actual analysis:

```json
{
  "id": "client-generated-uuid",
  "stage": "success",
  "expiresAt": 1793380800000,
  "cleanup": "confirmed",
  "result": {
    "source": "youcam",
    "colors": [
      { "field": "skin_color", "name": "Skin", "hex": "#BA9279", "source": "youcam" }
    ],
    "quality": { "has_face": true, "lighting": "good" },
    "partial": true
  }
}
```

Only validated HEX values, fixed source labels, allowlisted eye/hair names and safe quality hints are returned. Unknown/malformed/missing fields do not become invented measurements. No raw response, signed URL, file/task ID, key, seasonal label, undertone or attractiveness score is returned. With no usable colors, return an error; never silently substitute samples.

### `DELETE /v1/analyses/:id`

Requires the same job token. Clears the local result and marks it cancelled. It does **not** promise upstream task cancellation or reimbursement. The worker continues bounded polling for provider cleanup. Replacing a photo, switching to samples, ending the session or leaving the document requests cancellation; tab-close delivery is best effort, and server cleanup does not depend on it. After copying a successful result into browser memory, the frontend also calls DELETE immediately to release the backend result copy. Release clears facial data while retaining bounded opaque cleanup/idempotency metadata until expiry, so a delayed duplicate POST cannot create another paid task. Delivery of client release requests is best effort; unclaimed results still expire after 15 minutes.

## Limits, errors and lifetime

- At most two jobs, including active uploads/decodes and cleanup workers. At most 100 retained jobs, removed after absolute 15-minute expiry. Active expired jobs drop results and keep only cleanup metadata until completion.
- Incoming API requests: 120/minute globally; new submission attempts: six/ten minutes per direct peer IP. Forwarded IP headers are not trusted. Behind Render's proxy multiple visitors may share that conservative limit; configure an edge limiter before expanding this.
- Upstream: at most 200 requests per rolling 300 seconds. Retries honor `Retry-After` and backoff; status checks do not create new tasks or cause independent upstream loops.
- Upload request body timeout 30s; upstream requests 20s. Interactive wait changes to `timed_out` after two minutes while server polling continues up to ten minutes. Cleanup has three bounded attempts. No automatic paid POST retries.
- Invalid type/size/dimensions/decode errors: 415/413/422. Missing consent: 400. Invalid token: 401; unavailable/expired/unowned job: 404. CORS failure: 403. Busy/rate limits: 429 and `Retry-After`. Disabled/unarmed/exhausted service: 503. Provider transport/protocol errors: sanitized 502. Engine errors live in a job's `error: {code,message}`.

No API key, image bytes, base64, signed URL, original filename, raw result or token is logged by application code. Only generic startup/configuration/listener messages are printed. Disable reverse-proxy/APM request and response capture and check platform access-log behavior before use. Tokens use headers, not query strings. JS/native garbage collection is not a promise of cryptographic erasure; explicit buffers are wiped where owned, references released, and no image is persisted by this app.

## YouCam retention and deletion limitations

Uploading to YouCam creates a provider file ID and transfers a temporary copy to its signed destination. That is third-party retention even though Huefolio uses no permanent storage. YouCam's current [retention policy](https://docs.perfectcorp.com/develop/file_retention_period) documents 30-day retention. Its [finished-task deletion API](https://docs.perfectcorp.com/_bundle/reference/task_management.json?download=) supports deletion of associated files after processing. The worker requests it on success/error and reports `cleanup: confirmed` only on a successful deletion response; failed cleanup is `unconfirmed`.

Running tasks cannot be deleted using that operation. Failed/ambiguous task creation after uploading can orphan a provider upload without a documented standalone file-delete route. Crashes, service restarts, exhausted polling windows or deletion failures can leave files until provider expiry. The application never claims YouCam has zero retention or that closing a tab deletes its copy. The frontend displays these terms beside consent.

## Verification and remaining deployment checks

```sh
npm --prefix backend test
npm --prefix backend run check
npm test
npm run build:vercel
```

Tests use injected provider transports and synthetic images, never a real key or paid API calls. They cover image validation/metadata stripping, destination restrictions, key isolation, normalized results, workflow ordering, job ownership/idempotency, spend uncertainty, cancellation/cleanup, origin/consent/size boundaries and startup budget reconciliation. Browser QA additionally mocks the Render transport to exercise measured/partial results while preserving separate sample mode.

During this implementation, outbound npm installation was blocked by the execution environment. Tests used the already bundled **Sharp 0.35.5**, matching `package.json`, without adding vendored binaries or filesystem-specific imports to the project. Render must install this dependency during its build. A package lock was not generated; the direct dependency is pinned, while registry-resolved transitive dependencies remain an installation-time consideration.

Before public traffic, confirm the provider upload hosts and observed file envelope; perform one explicitly authorized real-photo smoke test with consent; verify Render↔YouCam networking and Vercel↔Render CORS/CSP in the deployed origins; reconcile and initialize a small spend allocation; confirm provider deletion status, host logging and no disk buffering. No real key, authenticated console access, live analysis, or Render/Vercel deployment has been performed in this workspace.
