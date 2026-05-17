# Visual regression harness

Image-diff harness for the Sherpa UI screens. Captures static HTML mockups
to PNG baselines, computes per-screen SSIM thresholds against a measured
self-render noise floor, and compares future renders against those
baselines.

## Workflow

1. **Calibration (Phase 0, T-L0-05).** `npm run calibrate` launches headless
   Chromium at a pinned 1440x900 viewport, loads each of the seven HTML
   mockups from `<sherpa-source>/design/ui/<screen>.html` twice, computes
   the SSIM noise floor between the two renders, and writes:
   - `tests/visual/baselines/<screen>.png` (one per screen)
   - `tests/visual/thresholds.json` with `threshold = clamp(noise + 0.02,
     0.85, 0.99)` per screen.

2. **Comparator self-tests (Phase 0).**
   `tests/visual/screenshot-comparator.spec.ts` exercises the SSIM
   comparator: identical inputs must score > 0.99, distinct screens
   must score < 0.95.
   `tests/visual/calibrate-thresholds.spec.ts` asserts the calibration
   artifacts are well formed.

3. **Per-screen specs (Phase 4 onward).**
   The seven `<screen>.spec.ts` files are intentionally `test.describe.skip`
   placeholders. Phase 4 (T-L4-A and following) replaces each body with a
   real navigation + screenshot + `compareScreenshots(...)` call once the
   corresponding React component lands.

## NPM scripts

- `npm run calibrate` — regenerate `thresholds.json` and all seven
  baselines from the source mockups.
- `npm run test:harness` — run only the live comparator and calibration
  specs (Phase 0 acceptance gates).
- `npm run test:visual` — run all specs in `tests/visual/`. Most are
  skipped until Phase 4 enables them.

## Cross-platform notes

Playwright supports Windows, Linux, and macOS uniformly. Browsers are
installed via `npx playwright install chromium`. Phase 0 (T-L0-05) only
installs Chromium; Firefox and WebKit are added by T-L6-C if needed.

`npx playwright install --dry-run` exits 0 on all three platforms; this
is the cross-platform smoke check for AC-T-L0-05-5.

## Reference

See `<sherpa-source>/plan/phase-4-presentation.md` for the iteration
model that consumes this harness during the visual review loop.
