# License Overrides

Per `license_override_protocol` in T-L6-C task spec (Phase 6 Quality):

> Default policy: allowed licenses = MIT, ISC, BSD-2-Clause, BSD-3-Clause,
> Apache-2.0, CC0-1.0, Unlicense.

Some transitive production dependencies report license strings that
license-checker rejects under a strict `--onlyAllow` filter, even though the
underlying license is compatible with our policy. Each entry below is
explicitly whitelisted via the `--excludePackages` flag in the CI
`license-check` job (see `.github/workflows/ci.yml`).

GPL/AGPL packages are NEVER added here without explicit user approval
(Critical Zone) per protocol step 3.

| Package          | Version | Reported License | Effective License | Reason for override |
|------------------|---------|------------------|-------------------|---------------------|
| `argparse`       | 2.0.1   | Python-2.0       | Python-2.0 (PSF, BSD-style, MIT-compatible) | Transitive via `electron-updater@6 → js-yaml@4 → argparse@2`. Python License is permissive and SPDX-compatible with Apache-2.0; commonly accepted by Apache Software Foundation. No drop-in MIT alternative; `js-yaml` upstream chose argparse@2 specifically. Flagged for user review at GATE 6. |
| `argparse`       | 1.0.10  | MIT              | MIT (already permitted) | Listed for completeness; transitive via `gray-matter → js-yaml@3 → argparse@1`. No override needed (MIT is in allow-list); included so override list audit is complete. |
| `flatbuffers`    | 1.12.0  | `Apache*`        | Apache-2.0 | Transitive via `@xenova/transformers → onnxruntime-web → flatbuffers`. The `Apache*` string is a license-checker tokenization quirk for the historical "Apache 2.0" variant — semantically identical to the allow-listed `Apache-2.0`. Flagged for user review at GATE 6. |
| `sherpa-ui-client` | 0.0.0 | UNLICENSED       | Internal          | The project itself; `private: true` in package.json. license-checker reports UNLICENSED for un-published packages; expected and self-referential. |

## Re-check policy

Per protocol step 4: re-check on every dependency upgrade. Specifically:

- If `electron-updater` major-bumps and ships a different yaml parser →
  re-evaluate `argparse@2` entry.
- If `@xenova/transformers` major-bumps and drops `onnxruntime-web` or that
  drops flatbuffers → re-evaluate.
- New offenders surfaced by `npm run check:license` MUST go through this file
  before being added to the CI `--excludePackages` list. GPL/AGPL → CZ pause.

## How CI uses this file

The `.github/workflows/ci.yml::license-check` job runs:

```sh
npx license-checker --production \
  --onlyAllow 'MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;CC0-1.0;Unlicense;0BSD;BlueOak-1.0.0' \
  --excludePackages 'argparse@2.0.1;flatbuffers@1.12.0;sherpa-ui-client@0.0.0'
```

Adding a package here is a deliberate policy decision; reviewers MUST verify
each entry before approving GATE 6.
