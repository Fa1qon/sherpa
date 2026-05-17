# Releasing Sherpa UI Client

> **Audience:** maintainers preparing a new release. End-users do **not** need
> to read this; the auto-updater (`electron-updater`) handles the apply flow
> against the trust-pinned manifests this pipeline produces.

This document describes the one-time setup for the production signing keypair
and the per-release workflow. It is the user-facing companion to
`scripts/inject-release-key.mjs`, `scripts/sign-release-manifest.mjs`, and
`.github/workflows/release.yml`.

The trust model is documented in:

- `decisions/ADR-006.md` §B3-SEC patch (build-time key embedding, hermetic
  CI build, no runtime fetch of signing key).
- `requirements.md` NF27 (signing-key pinning).
- `src/core/adapters/updater/signing_key.ts` header §Slot model (PRIMARY /
  RETIRED / TEST slots).

## 1. One-time setup — generate the production keypair

The release pipeline uses **Ed25519** for manifest signatures. Generate the
keypair **once, offline**, on a machine you control. Do **not** generate it
inside CI; the private half must never travel through the workflow's logs.

```bash
# Generate Ed25519 keypair (PEM PKCS#8 private + SPKI public).
openssl genpkey -algorithm ed25519 -out sherpa-release-private.pem
openssl pkey -in sherpa-release-private.pem -pubout -out sherpa-release-public.pem

# Sanity-check (key types should both report Ed25519):
openssl pkey -in sherpa-release-private.pem -text -noout | head -3
openssl pkey -in sherpa-release-public.pem -text -noout -pubin | head -3
```

Equivalent Node.js form (interchangeable):

```bash
node -e '
  const c = require("node:crypto");
  const { publicKey, privateKey } = c.generateKeyPairSync("ed25519");
  require("node:fs").writeFileSync(
    "sherpa-release-private.pem",
    privateKey.export({ type: "pkcs8", format: "pem" })
  );
  require("node:fs").writeFileSync(
    "sherpa-release-public.pem",
    publicKey.export({ type: "spki", format: "pem" })
  );
'
```

**Storage of the private key.** Keep `sherpa-release-private.pem` in an offline
password manager (1Password, Bitwarden, hardware-backed) **and** as a
GitHub Actions secret (next step). Never commit it. Never paste it into a
browser, IDE, or chat. The key has no passphrase by design — adding one would
require an interactive prompt the CI workflow cannot satisfy.

## 2. Upload secrets to GitHub Actions

In the repository settings → **Secrets and variables → Actions**, create two
repository secrets:

| Secret name                   | Contents                                                  |
| ----------------------------- | --------------------------------------------------------- |
| `SHERPA_RELEASE_PRIVATE_KEY`  | Full PEM of `sherpa-release-private.pem` (BEGIN/END incl) |
| `SHERPA_RELEASE_PUBLIC_KEY`   | Full PEM of `sherpa-release-public.pem` (BEGIN/END incl)  |

Multi-line values are supported — paste the entire PEM verbatim, including the
`-----BEGIN ... KEY-----` / `-----END ... KEY-----` markers and the trailing
newline.

The public key lives in a separate secret (rather than being derived from the
private key at runtime) so future key-rotation reviews can inspect or rotate
the public-key-only side without unnecessarily exposing the private half.

### Optional — OS-level code signing (deferred per `cert_renewal_playbook` §8)

T-L7-04 ships **manifest signing only**. OS-level Authenticode (Windows) and
notarization (macOS) are deferred until a CA-signed cert is provisioned (see
`phase-7-release.md` `cert_renewal_playbook` for the full rotation procedure).
When ready, populate these secrets — the workflow already references them and
will pick them up automatically:

| Secret name                       | Purpose                                       |
| --------------------------------- | --------------------------------------------- |
| `WIN_CSC_LINK`                    | URL or base64 to .pfx for Windows Authenticode |
| `WIN_CSC_KEY_PASSWORD`            | Password for the .pfx                          |
| `APPLE_ID`                        | Apple Developer ID e-mail                      |
| `APPLE_APP_SPECIFIC_PASSWORD`     | App-specific password for `notarytool`         |
| `APPLE_TEAM_ID`                   | 10-char Apple Team ID                          |

Until those are set, the workflow runs with `CSC_IDENTITY_AUTO_DISCOVERY=false`
and produces unsigned-by-OS installers. SmartScreen/Gatekeeper will require the
"More info → Run anyway" path on first install — documented in the alpha-1
release notes.

## 3. Per-release procedure

```bash
# 1. Bump version in package.json + commit.
npm version 0.1.0-alpha.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "release: v0.1.0-alpha.1"

# 2. Tag and push.
git tag v0.1.0-alpha.1
git push origin master v0.1.0-alpha.1

# 3. Draft a release on GitHub from the tag (paste changelog).
gh release create v0.1.0-alpha.1 --draft --title "v0.1.0-alpha.1" --notes-file CHANGELOG.md

# 4. Click "Publish release" in the GitHub UI. The workflow fires on
#    `release: published` and produces:
#       - Sherpa UI Client-<v>-win-x64.exe + .sha256
#       - Sherpa UI Client-<v>-mac-{x64,arm64}.dmg + .sha256
#       - Sherpa UI Client-<v>-linux-x64.AppImage + .sha256
#       - Sherpa UI Client-<v>-linux-x64.deb + .sha256
#       - manifest-{win,mac,linux}.json (Ed25519-signed; trust root for
#         electron-updater)
#       - latest{,-mac,-linux}.yml (electron-updater channel pointers)
#       - <artifact>.blockmap (delta-update sidecars)
#    All uploaded to the GitHub Release as release assets.
```

If GitHub is down at upload time (AC-T-L7-04-4), the artifacts also persist
on the workflow-run page for 30 days — re-upload manually with `gh release
upload v0.1.0-alpha.1 <files>` once GitHub recovers.

## 4. Rotation procedure

See `decisions/ADR-006.md` §B3-SEC + `phase-7-release.md`
`cert_renewal_playbook` (full 8-step procedure). In short:

1. Generate the new keypair (`openssl genpkey -algorithm ed25519 ...`).
2. Set `SHERPA_RETIRED_PUBLIC_KEY` secret to the **current** public PEM
   (it becomes the retired slot once the next release ships).
3. Update `SHERPA_RELEASE_PUBLIC_KEY` and `SHERPA_RELEASE_PRIVATE_KEY` to
   the new pair.
4. Cut a release; the workflow injects both into `signing_key.ts` (primary
   + retired slot) so existing installs verifying against the old key
   still trust the new release while migrating.
5. After the transition window (one or two releases), unset
   `SHERPA_RETIRED_PUBLIC_KEY`; the next release drops the retired slot.

## 5. Local parity test (no real keys required)

To smoke-test the inject + sign scripts without provisioning real keys:

```bash
# Generate a throwaway Ed25519 keypair.
openssl genpkey -algorithm ed25519 -out /tmp/test-priv.pem
openssl pkey -in /tmp/test-priv.pem -pubout -out /tmp/test-pub.pem

# Inject (rewrites signing_key.ts in place — restore afterwards!).
SHERPA_RELEASE_PUBLIC_KEY="$(cat /tmp/test-pub.pem)" \
  node scripts/inject-release-key.mjs

# Verify the prebuild guard now passes.
node scripts/check-signing-key.mjs

# Sign a fixture manifest.
SHERPA_RELEASE_PRIVATE_KEY="$(cat /tmp/test-priv.pem)" \
SHERPA_RELEASE_PUBLIC_KEY="$(cat /tmp/test-pub.pem)" \
  node scripts/sign-release-manifest.mjs \
    --build \
    --out /tmp/manifest.signed.json \
    --version 0.0.0-smoke \
    --artifact tools/dev-server/sample-core.tar.gz

# Restore signing_key.ts to its pristine state.
node scripts/inject-release-key.mjs --restore
git diff --quiet src/core/adapters/updater/signing_key.ts \
  && echo "OK: signing_key.ts restored to null" \
  || echo "ERROR: working tree dirty; git checkout -- src/core/adapters/updater/signing_key.ts"
```

The `signing_key.ts` rewrite + restore is **idempotent**:

- Re-running the injector while `RELEASE_PUBLIC_KEY` is already non-null
  refuses with a clear error (prevents accidental double-injection in CI
  re-runs).
- `--restore` reverts the slot back to `null` exactly.
