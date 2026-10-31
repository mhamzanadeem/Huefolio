# Huefolio

Your colors. Your identity. Your style.

Huefolio is a personal color discovery and visual identity website. A consented selfie can be analyzed by YouCam's Facial Color Tones Analyzer; Huefolio uses the returned colors for transparent palette calculations, comparisons and downloadable color notes. It provides no medical/skincare advice, attractiveness scores, seasonal classifications or Virtual Try-On.

Built for the YouCam API Hackathon using API credits provided for hackathon development. Huefolio is an independent hackathon project, not an official Perfect Corp. product or endorsement.

**Submission status, 31 October 2026:** locally tested release candidate. No public frontend/backend deployment has been verified, genuine YouCam analysis has not been run, and the application source has not been published from this workspace. See the evidence and blockers in [hackathon readiness](docs/HACKATHON-READINESS.md) and the [deployment runbook](docs/DEPLOYMENT.md).

## Try the judge journey

Run the frontend below and choose **Explore sample colors**. The sample requires no account, key or photo and is labeled as illustrative throughout; it is not a personal API result. Explore Palette → Match lab → Occasions → Identity card, then download a PNG or JSON and try Exit or Start over. Connected analysis requires the separately configured backend and explicit photo consent.

## Technology stack

- Frontend: semantic HTML, responsive CSS, native JavaScript modules and browser Canvas/Blob downloads; no runtime framework or dependency.
- Backend: Node.js HTTP server and Sharp 0.35.5 for memory-only image validation/re-encoding.
- Integrations: official YouCam asynchronous file/task APIs, server-only credentials, no database or persistent image service.
- Hosting targets: Vercel static Build Output API, single-instance Render Node service, GitHub source and QA workflow.

The secure backend is implemented for **Render**, with the static frontend prepared for **Vercel**. Start with [backend/README.md](backend/README.md) for credentials, exact origin/upload-host configuration, budget initialization, deployment, API routes and privacy limitations. The earlier research is preserved in [docs/YOUCAM-INTEGRATION-PLAN.md](docs/YOUCAM-INTEGRATION-PLAN.md).

Connected analysis is disabled until the backend is explicitly configured and its process budget initialized. The sample workspace remains independent. No database, accounts or permanent photo storage are used. YouCam may retain its uploaded copy under its policy; finished-task deletion is requested on a best-effort basis.

## Color intelligence

The active-session product now includes a measured color identity, generated personal palette with traceable HSL recipes, Why This Color explanations, a four-color comparison board, six occasion palettes (including Traditional event), and source-aware PNG/text identity cards. API values, Huefolio calculations, and personal picks stay separate. Missing fields never receive sample replacements.

See [docs/COLOR-INTELLIGENCE.md](docs/COLOR-INTELLIGENCE.md) for formulas, preference behavior, provenance, occasion rules and limitations. No undertone, season, medical advice or attractiveness score is inferred.

## Run

**Electron is not needed.** Run the frontend in your browser and the backend as a separate Node.js process. For deployment the frontend goes to Vercel and backend to Render. Use Node 24 LTS for the complete project.

For a quick sample-only preview on PowerShell:

```powershell
cd C:\Huefolio
npm run dev
```

Open `http://127.0.0.1:4173` and choose **Explore sample colors**. This mode needs neither a backend nor API credentials. Stop a running terminal process with Ctrl+C. To use connected photo analysis, follow the two-terminal setup below and configure the server-only YouCam settings and startup budget described in the backend README.

Frontend: Node.js 20+ and no runtime dependencies. Backend: Node.js 24 LTS and Sharp; see its README. The commands below run the standalone frontend/sample workspace.

```sh
npm run dev
```

Open http://127.0.0.1:4173/ in a browser. Set `PORT` to use another port. Use **Explore sample colors** to try the complete workspace without a photo.

```sh
npm test
npm run build
node scripts/serve.mjs --dist
```

The build validates JavaScript and copies static assets into `dist/`. Host that directory on a static server; hash routes need no rewrite configuration. The included local server exposes only the application HTML, favicon, and source assets, with no upload endpoint.

For the complete local stack on PowerShell, use Node 24 LTS and follow these steps in separate terminals:

```powershell
npm --prefix backend install
Copy-Item backend/.env.example backend/.env
# Edit backend/.env locally. Analysis starts disabled; secrets stay here.
npm run backend
```

```powershell
Copy-Item .env.example .env
# Set HUEFOLIO_BACKEND_URL=http://127.0.0.1:10000 in .env (public URL only).
node --env-file-if-exists=.env scripts/build.mjs --vercel
node scripts/serve.mjs --dist
```

Open `http://127.0.0.1:4173`. Do not serve repository files with a general-purpose public directory server. `npm run dev` uses `src/config.js`; the connected URL is injected into built assets, so use the built server for connected local testing. Frontend `.env` is not implicitly loaded by `npm run build`. Backend environment variables are documented in [backend/README.md](backend/README.md#backend-environment); Vercel receives only the public backend origin.

## Grouped Git publication

`scripts/commit-plan.json` groups the initial application changes into 20 related commits. Generated files, the historical `design/` preview and local QA artifacts stay ignored; source, tests, contracts, documentation and CI remain versioned. No application files are deleted by `.gitignore`.

```powershell
node scripts/commit-and-push.mjs
# Preview the groups first. Then, in a Git-writable, networked checkout:
node scripts/commit-and-push.mjs --execute
```

The helper validates that every changed file belongs to one group, refuses pre-staged changes or an unexpected origin, runs release/security checks, creates `codex/hackathon-readiness` when starting on main, commits nonempty groups and pushes once without force. It does not fabricate empty commits. If only the push fails, rerun it on the same branch to push the existing commits; do not rewrite history. Review/merge that branch before deploying from main. Git write permissions and remote authentication/network access are required.

## Pages

| URL fragment | Page |
| --- | --- |
| `#/` | Landing |
| `#/upload` | Photo selection, preview, consent notice |
| `#/processing` | Honest analysis availability screen |
| `#/results` | API-data empty state and separate sample interpretation |
| `#/palette` | Color selection, HEX copy, calculated complement, card choices |
| `#/lab` | Picker, four-color comparison board, OKLab/hue/text-contrast explanations, HEX copying |
| `#/occasions` | Six creative source-labeled occasion palettes |
| `#/export` | Selected-color card, PNG/text export, reset |

Exploration pages show helpful empty states until a sample session is started. For isolated service loading, error, partial-data, success, and session-expiration fixtures, open `/?review=1#/states`. Fixtures never run an analysis or feed fabricated personal results into the workspace.

## Structure

- `src/app.js`: routing, session lifecycle, photo decoding, event handling, notifications.
- `src/components.js`: reusable buttons, cards, navigation, swatches, modal, notices, identity card.
- `src/pages.js` and `src/product-pages.js`: page compositions, source-aware product flow, empty states and optional QA fixtures.
- `src/color-intelligence.js` and `src/product-components.js`: transparent HSL/OKLab/contrast math, generation, explanations and occasion rules.
- `src/model.js`: in-memory measured, generated and user-picked colors, preferences and card selection.
- `src/export.js`: local card PNG/text and palette/combination PNG/JSON downloads; no photo access.
- `src/session-privacy.js`: conditional browser leave guard and absolute expiry checks.
- `src/api.js` and `src/config.js`: public Render transport, temporary job-token operations.
- `backend/`: server-only validation, YouCam client, job lifecycle, security and deployment documentation.
- `src/styles.css`: approved ivory/sage/lavender design tokens and responsive layouts.
- `scripts/`: dependency-free local server/build and optional browser verification.
- `tests/model.test.mjs`: focused logic, validation, provenance, and escaping checks.
- `design/`: optional historical review prototype retained locally and ignored by Git; not used by the website build.

## Session and data behavior

Photos are previewed locally and sent only after explicit consent. The backend validates magic/type, encoded size, decoded dimensions and frames, strips metadata, and forwards a JPEG from memory. Refresh/close/reset clears local state and requests cancellation where possible; backend jobs expire after 15 minutes. No user database, permanent image storage, analytics or external fonts are used. Measured YouCam colors and sample colors remain separate; creative pairings are labeled as application calculations. Exports never include the selfie.

The backend does not log image bodies, credentials or raw provider responses. Its own image buffers are wiped/released and no temporary files are written. YouCam's documented 30-day retention and the limitations of finished-task deletion are disclosed before upload. Full details and deployment checks are in the backend README.

Exit returns to the welcome page; Start over opens a fresh photo step. Both require confirmation, default to Keep exploring, and offer download options before clearing. The footer's Privacy & session dialog explains photo use, provider terms, temporary memory and leave-warning limitations. Dialogs support Escape, a keyboard focus cycle, and focus restoration.

The native `beforeunload` warning is attached only while session work exists. Requesting this warning never discards results: choosing Stay preserves them. Browsers control its text and may suppress it, especially on mobile; it cannot intercept every close. `pagehide` clears the model, private rendered markup, photo/download object URLs, timers, notifications and dialogs, and aborts active client polling. Back/forward-cache restoration starts empty. Hiding a tab alone does not end its session. Completed real results expire at their absolute backend deadline (at most 15 minutes), also checked on focus, visibility restoration, rendering and interaction to handle delayed timers. JavaScript reference release is not a claim of physical RAM erasure.

After successful result transfer, the client requests release of the backend result copy immediately. Cancellation/release requests are bounded and best effort; undelivered requests leave unclaimed results subject to the server's absolute 15-minute expiry. Bounded opaque job metadata remains for cleanup and duplicate-submission protection. Provider retention is separate from Huefolio's session lifecycle.

Identity cards download as PNG or text. The complete palette, kept comparison colors and current occasion combination download as PNG or JSON, including individual color provenance; JSON also preserves calculation inputs and occasion roles. Downloads use browser APIs without an analysis request, include no selfie, and remain on the user's device after session reset. A reset suppresses any export still being generated. No localStorage, sessionStorage, IndexedDB, cookies or service worker stores personal data.

## Verification

```sh
npm test
npm run test:backend
npm --prefix backend run check
npm run check:release
npm run test:browser
```

`check:release` builds clean public output, injects a synthetic server-only secret canary, checks the exact disclosure/security headers and a 100 KiB gzip asset budget, and scans publishable files, locally available Git history and generated frontend assets for credential patterns. `check:security` reruns the scan on an existing build. Scanning cannot prove the absence of every secret or inspect inaccessible remote history. `.github/workflows/qa.yml` prepares these checks plus isolated Playwright QA and a dependency audit; it has not been executed on GitHub. Browser tooling is development-only and is not shipped with the site.

`npm test`: 23 frontend/model/color-intelligence/privacy/fixture checks; `npm run test:backend`: backend security/workflow tests after installing backend dependencies. `npm run build`: static build and syntax checks. Live provider validation has not been performed. Tests never spend API units.

`scripts/browser-check.cjs` uses an existing Playwright installation as a development-only tool. It does not add a package dependency. Set `PLAYWRIGHT_MODULE` to the module path if it is not on the normal module search path, and optionally `CHROMIUM_PATH` to an installed Chromium executable, then run `node scripts/browser-check.cjs`.

Browser checks cover all routes at 320, 390, 768, and 1440px, empty/sample views, horizontal overflow, keyboard skip navigation, copy fallback, color input, occasion choices, photo format/size/decoding errors, consent reset on replacement, card/palette/board/combination downloads, PNG dimensions, export failure and reset races, empty card, reset/cancel, native Stay/Leave, expiry, simulated cache restoration, zero route-driven requests or browser storage, 14 state fixtures, and not-found routing. Screenshots and sample downloads go to ignored `.qa/`.

The execution sandbox blocks loopback requests with `EACCES`. The real HTTP boundary test is explicitly skipped here (and must run in CI); handler-level tests still execute. Chromium verification fulfills repository assets and a mocked Render API directly, with no real provider network. Backend tests use the identical already-bundled Sharp version because registry DNS is blocked. A dependency lockfile and current vulnerability audit remain pending registry access. Screenshots and downloads are visually reviewed; computed contrast, target sizes and keyboard checks are not a full WCAG audit or Safari/Firefox compatibility certification. Production latency, Core Web Vitals, Render memory under concurrent real uploads and genuine API accuracy remain unmeasured.
