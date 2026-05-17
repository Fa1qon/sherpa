# Production distribution server — configuration notes

> **Scope.** `tools/dev-server/index.js` is a local stub for testing the
> updater's polling + download paths against a controllable URL (T-L7-03 /
> AC-3). It is **not** suitable for production. This document records the
> recommended production deployment options. Choose one per the team's
> hosting preferences; all three satisfy the contract the
> `ElectronUpdaterAdapter` consumes.

## Endpoint contract

The updater expects the following HTTPS endpoints (rooted at a single
origin):

| Path                              | Content              | Cache hint           |
| --------------------------------- | -------------------- | -------------------- |
| `/channels/<channel>.json`        | JSON channel pointer | short (≤ 5 min)      |
| `/v/<version>/manifest.json`      | Signed JSON manifest | long, immutable      |
| `/v/<version>/core.tar.gz`        | Core payload archive | long, immutable      |
| `/v/<version>/<asset>`            | Per-platform installers (e.g. `Sherpa-Setup-<v>.exe`) | long, immutable |

The manifest shape is documented in
`src/core/adapters/updater/manifest_verifier.ts` (`UpdateManifest`). It MUST
be Ed25519-signed by a key whose SHA-256 hash matches an entry in
`src/core/adapters/updater/signing_key.ts` `PINNED_KEYS`. Signing is owned
by the release pipeline (T-L7-02 / T-L7-04); this document covers serving
only.

TLS is mandatory — `electron-updater` rejects HTTP origins.

## Option A — nginx + Let's Encrypt (self-hosted)

Cheapest if a VPS is already in the deployment story. nginx serves the
static files; certbot rotates the certificate.

```nginx
# /etc/nginx/sites-available/releases.sherpa.example
server {
    listen 443 ssl http2;
    server_name releases.sherpa.example;

    ssl_certificate     /etc/letsencrypt/live/releases.sherpa.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/releases.sherpa.example/privkey.pem;

    root /var/www/sherpa-releases;

    # Channel pointers — short cache so a new release flips fast.
    location ~ ^/channels/.+\.json$ {
        add_header cache-control "public, max-age=300";
        try_files $uri =404;
    }

    # Manifests + artefacts — immutable, aggressive cache.
    location ~ ^/v/[^/]+/.+ {
        add_header cache-control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
}
```

Layout on disk:

```
/var/www/sherpa-releases/
├── channels/
│   ├── stable.json
│   └── beta.json
└── v/
    ├── 0.1.0-alpha.1/
    │   ├── manifest.json
    │   ├── core.tar.gz
    │   └── Sherpa-Setup-0.1.0-alpha.1.exe
    └── 0.1.0-alpha.2/
        └── ...
```

Renewal: `certbot renew --post-hook "systemctl reload nginx"` from cron
(see `man certbot`).

## Option B — Cloudflare R2 + Workers (managed object store)

Recommended if the team already uses Cloudflare. R2 is S3-compatible with no
egress fees; a single Worker handles the channel-pointer rewrite if needed.

1. Create an R2 bucket `sherpa-releases`.
2. Upload artefacts via the dashboard, `wrangler r2 object put`, or CI:

   ```bash
   wrangler r2 object put sherpa-releases/v/0.1.0-alpha.1/manifest.json \
     --file ./dist/manifest.json
   wrangler r2 object put sherpa-releases/v/0.1.0-alpha.1/core.tar.gz \
     --file ./dist/core.tar.gz
   ```

3. Bind the bucket to a public domain via R2's "Connect Domain" feature.
   Cloudflare provisions and rotates the TLS cert automatically.
4. Configure cache rules in the dashboard:
   - `/channels/*.json` → cache 5 min, edge revalidation
   - `/v/*` → cache 1 year, immutable

Drawback: object listings are not enabled by default — that is fine, the
updater never lists; it requests known paths.

## Option C — AWS S3 + CloudFront (managed CDN)

Closest to the legacy "release bucket + CDN" pattern. Higher per-request
billing than R2 but mature tooling.

1. Create an S3 bucket `sherpa-releases-prod` (private, no public ACLs).
2. Front it with a CloudFront distribution:
   - Origin: the bucket via OAC (Origin Access Control)
   - Default behaviour: redirect-to-HTTPS, GET only
   - Add behaviour `/channels/*.json` → cache policy "5 min TTL"
   - Add behaviour `/v/*` → cache policy "Optimised for static" (1 year)
3. Issue the cert via ACM (us-east-1 region required for CloudFront) for
   `releases.sherpa.example` and attach it to the distribution.
4. Upload artefacts via `aws s3 cp` or the release pipeline.
5. Invalidate `/channels/*` after each new release:

   ```bash
   aws cloudfront create-invalidation \
     --distribution-id E1ABCDEF \
     --paths '/channels/*'
   ```

CloudFront is happy to serve `application/gzip` directly — set the metadata
on upload (`--content-type application/gzip`).

## Channel pointer hygiene

Whichever option is chosen:

- The channel pointer (`/channels/<channel>.json`) is the only mutable file
  in the layout. All other files are immutable. This pattern lets CDNs
  cache aggressively and lets atomic version flips happen by overwriting a
  single small JSON.
- After updating a channel pointer, invalidate / purge the cache for that
  one path — never for `/v/*`.
- For phased rollouts, write a percentage gate into the channel pointer
  and have the updater honour it (out of scope for T-L7-03; tracked
  under future updater work).

## Health checks

A production deployment SHOULD expose a lightweight `/healthz` endpoint
(plain-text 200) for load-balancer probes. The dev stub does the same.

## Offline / restricted networks

Some end-user deployments live on networks that block updates. The updater
already handles `update:check` failures gracefully (renders no banner,
logs the audit event). No server-side action required — but operators
deploying inside an air-gapped LAN can run a copy of `tools/dev-server`
on their own infrastructure as long as TLS + the pinned signing key
chain are honoured.
