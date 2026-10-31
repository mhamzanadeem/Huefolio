# Huefolio color intelligence v1

Implemented without new dependencies or paid API calls. All data lives in the active browser session. The existing YouCam backend remains responsible for image handling and for normalizing actual API fields.

## Data provenance

| Kind | Source marker | What it means |
| --- | --- | --- |
| Measured profile | `youcam` | Available `skin_color`, `eye_color`, `lip_color`, `eyebrow_color`, `hair_color`, with available eye/hair names from the verified API contract |
| Creative suggestion | `app` | A reproducible Huefolio HSL calculation; carries its anchor, recipe, algorithm version and HEX value |
| Personal pick | `user` | An explicit color chosen and kept by the user; never becomes a measured characteristic |
| Offline sample | `sample` | Illustrative input for the independently selected sample workspace; never a fallback for missing personal results |

Missing measurements remain missing. A partial profile may generate suggestions from the available anchor, but the measured section never receives calculated replacements. The profile view displays only returned colors and available eye/hair labels. No season, undertone, medical, skincare, beauty or attractiveness classifications are generated.

## Personalized palette algorithm

`huefolio-hsl-v1` selects measured skin color as the anchor when available, otherwise the first available valid measurement. In sample mode, the first sample color is the anchor. The six candidate recipes below use the anchor's HSL hue `h` and saturation `s`. Clamp calculated saturation to [0,1], convert to sRGB, round to 8-bit HEX, then remove duplicates against measured colors and earlier suggestions. The palette may contain fewer than six suggestions for neutral inputs.

| Recipe | Hue | Saturation | Lightness |
| --- | ---: | ---: | ---: |
| Soft light | h | s × .45 × direction | .82 |
| Grounded shade | h | s × .65 × direction | .28 |
| Neighboring accent | h + 30° | s × .8 × direction | .55 |
| Neighboring shade | h − 30° | s × .8 × direction | .55 |
| Complement accent | h + 180° | s × .8 × direction | .55 |
| Quiet neutral | h | s × .2 × direction | .92 |

Direction is explicitly user-selected: Soft .65, Balanced 1, Bold 1.15. It is not an inferred facial trait. Changing it never modifies API values. Generated IDs include their calculated HEX so card selections are not silently carried over to changed shades. Unchanged measured/user selections are preserved by ID.

These recipes are creative starting points, not a scientifically validated prediction of flattering clothing/makeup. Other measured colors remain useful references in the lab and identity card; the generation anchor is named in each explanation rather than implying all fields are combined into an opaque classification.

## Why This Color?

Each palette color is compared with the nearest measured/reference color. The lab also supports choosing any measured or generated palette reference. Distances and categories are **Huefolio calculations**, not official YouCam output.

- **OKLab distance:** decode sRGB channels to linear light, transform to OKLab (D65), then calculate Euclidean distance ×100. Lower means closer in that color space. Huefolio uses a transparent distance threshold of 8 for the “nearby” label; this is an application heuristic, not a universal perceptibility threshold or a compatibility percentage. Exact HEX identity takes priority.
- **Hue separation:** the shorter HSL hue arc, 0–180°. Neighboring is ≤30°; complementary is ≥165°. Suppress hue labels when either saturation is below .1 or lightness lies outside [.03,.97], where hue is unreliable as an explanation.
- **Text contrast:** `(lighter luminance + .05)/(darker luminance + .05)` using linearized sRGB relative luminance. This describes text/flat-background legibility, not fashion contrast or attractiveness. A high text-contrast ratio does not certify the whole page's accessibility.
- **Complement swatch:** rotate HSL hue 180°, preserving saturation and lightness. Neutral colors therefore do not acquire an invented complementary hue.

Color-space reference and formulas: [W3C CSS Color 4](https://www.w3.org/TR/css-color-4/), including HSL conversion and OKLab conversion. Text-contrast definition: [W3C WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Formula constants are implemented locally; no external service is called. Warm/cool undertone classification is deliberately absent: neither hue arithmetic nor the selected API establishes a person's undertone.

## Comparison board and user choices

Users can keep up to four picker/HEX choices and see their closest personal palette shades side by side. Reference candidates include measured and generated colors, **not** the user's comparison choices; a choice cannot become its own nearest reference just by being kept. Each tile identifies the nearest reference's provenance. Copy HEX, remove, and include-on-card actions use large labeled controls. Invalid HEX input is rejected. Duplicates and the four-choice limit produce readable notifications.

## Occasion palettes

Wedding, Interview, Professional, Party, Casual and Traditional event select three distinct available palette values where possible. Inputs include measured values, generated suggestions and kept user colors; each output retains its own provenance.

- Wedding/Casual use the lightest base; Interview/Professional/Party/Traditional use the darkest.
- Supporting shade is the distinct remaining value nearest HSL lightness .35 for a light base, or .8 for a dark base.
- Accent selects a distinct remaining value with hue separation closest to 180° for Party/Traditional, or 30° otherwise. Neutral hue gaps count as zero only for deterministic ordering, not as meaningful hue classifications.
- Ties follow stable input order. A sparse palette produces fewer roles rather than repeating a color or filling with samples.

“Traditional event” is not a cultural classification. Its view explicitly asks the user to follow cultural context and dress code. All occasion rules are editorial suggestions; **Use this combination on my card** is an explicit user selection.

## Identity card

Selected measured, generated and personal-choice colors retain per-color provenance. Up to eight may be selected so labels remain readable. PNG exports are 1400px wide: 1220px tall for one row (1–4 colors), or 1500px tall for two rows (5–8). The readable text export includes full generated recipes and anchors.

The card includes the selected palette, available measured/reference profile with eye/hair names, color direction, and selected occasion. Users may omit the separate API/profile detail section; selected palette colors and their sources remain visible. The preview and exported snapshot use the same context. No selfie, identifier, account, invented facial field, confidence score or season is included. Exports are deliberate device downloads, never backend-persisted artifacts.

## Implementation and verification

- `src/color-intelligence.js`: pure math, generation, provenance labels and occasion composition.
- `src/model.js`: session-only measured/generated/user collections and card selection.
- `src/product-components.js`, `src/product-pages.js`: identity, grouped palette, explanations, comparison board, six occasions and card controls.
- `src/app.js`: picker actions, keeping/removing colors, preference remapping, card limits, explicit occasion selection and reset/expiry behavior.
- `src/components.js`, `src/export.js`, `src/styles.css`: consistent preview, source-aware exports and responsive styles.

Tests cover reference OKLab coordinates, HSL roundtrips, hue wrap/neutral cases, black/white contrast, deterministic recipes and provenance, preference changes, missing/invalid/single-color profiles, unique occasion roles, independent user choices and explicit export details. Browser checks cover empty/sample and mocked measured profiles at 320/390/768/1440px, multi-color comparisons, source separation, preference controls, eight-color export limits, characteristic inclusion, PNG/text output, no sample substitution, reset and refresh.

Live YouCam analysis is still subject to the backend's existing secure environment, upload-host verification and budget initialization. This feature work uses no API credits and does not change provider retention or credential handling.

Validation result: 20 frontend/color/fixture tests and 15 backend tests passed; static/Vercel output builds passed. Expanded Chromium checks passed for all eight routes and measured/sample product views at 320, 390, 768 and 1440px, including four-color board support, an eight-color PNG with all provenance groups, blocked ninth selection, text export preferences and optional API characteristics. Mobile and exported-card screenshots were visually reviewed. Browser requests use an offline mocked backend because live credentials/deployment are not configured; this is not a live YouCam accuracy or fashion-effectiveness validation.
