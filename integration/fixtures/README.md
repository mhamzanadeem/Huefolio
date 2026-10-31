# Synthetic wire examples — never personal results

Every `*.synthetic.json` file here was authored for offline contract discussion. No payload came from a person, live analysis, or paid API call. Field names/types come from the official contracts linked in `docs/YOUCAM-INTEGRATION-PLAN.md`. Values, task/file identifiers, and example messages are fabricated test values. Never submit these identifiers. The upload URL uses the reserved `.invalid` domain.

Metadata is kept here rather than inserted into provider response bodies. The existing browser app does not import these fixtures, and the static build/server does not expose `integration/`.

| File | Meaning |
| --- | --- |
| `color-success.synthetic.json` | Documented color and face-quality fields |
| `color-partial.synthetic.json` | Possible sparse object permitted by the schema; not evidence of actual partial behavior |
| `task-created.synthetic.json` | Submission acknowledgement only |
| `task-running.synthetic.json` | No progress percentage or results |
| `task-error.synthetic.json` | Engine failure within an HTTP-success envelope |
| `http-credit-error.synthetic.json` | Non-2xx request failure, separate from engine status |
| `file-created.synthetic.json` | Top-level `files` response shape, following the official example |
| `face-shape.synthetic.json` | Optional endpoint audit example for `features: ["faceShape"]`; not selected for Huefolio |
| `delete-finished.synthetic.json` | Successful provider cleanup acknowledgement |
| `delete-running-error.synthetic.json` | Cleanup is not cancellation of a running task |

Declarations in `integration/youcam-contracts.d.ts` preserve the vendor's optional response properties. They are not runtime validators. Future adapters must validate envelopes and allowlist outputs; new unknown fields must not become UI facts automatically. See the plan's discrepancies before treating these as a live-service guarantee.
