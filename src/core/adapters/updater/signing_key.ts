// Placeholder stub for the updater workstream (METH-070 T-L2-I).
// Real implementation: Ed25519 public key for verifying signed update bundles.
// Until the updater ships, this file allows the dev build and e2e tests to
// import paths that reference it (no consumers actually call into it).
// Replace before any production-release-flagged build.

export const SIGNING_KEY_STATUS = 'stub' as const;

export function getSigningKey(): never {
  throw new Error(
    'Signing key infrastructure not implemented (METH-070 T-L2-I). This is a dev-mode stub.',
  );
}
