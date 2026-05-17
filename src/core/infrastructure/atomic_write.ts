// Atomic file write — temp file + fsync + rename, with typed error surfaces.
// Sources:
//   - design/data.md §5 (atomic write protocol — temp + fsync + rename)
//   - design/data.md §11.1 (ENOSPC → emit StorageFull, surface StorageFullError)
//
// History note: this module previously imported sibling `event_bus.ts` and
// `storage_errors.ts`. Those were METH-070 plumbing and were removed during
// the v1 redo (Plan 1 extended core purge). The error classes are now
// inlined below and the optional event sink is a minimal structural type so
// this file has zero sibling-imports inside `src/core/infrastructure/`.
// Per ADR-001 §3 dependency rule: infrastructure depends on Node built-ins only.

import { promises as nodeFs } from 'node:fs';
import { Buffer } from 'node:buffer';

/**
 * StorageFullError — emitted when a write fails with `ENOSPC` (no space left).
 */
export class StorageFullError extends Error {
  readonly code = 'ENOSPC' as const;

  constructor(
    public readonly path: string,
    public readonly bytesAttempted?: number,
  ) {
    super(
      `No space left on device (path=${path}${
        bytesAttempted !== undefined ? `, attempted=${bytesAttempted}` : ''
      })`,
    );
    this.name = 'StorageFullError';
  }
}

/**
 * StoragePermissionError — wraps `EACCES` / `EPERM` failures with the exact
 * operation that was denied.
 */
export class StoragePermissionError extends Error {
  readonly code = 'EACCES' as const;

  constructor(
    public readonly path: string,
    public readonly operation: 'read' | 'write' | 'delete',
  ) {
    super(`Permission denied: ${operation} ${path}`);
    this.name = 'StoragePermissionError';
  }
}

/**
 * StorageLockedError — `EBUSY` failure (file held by another process / handle).
 */
export class StorageLockedError extends Error {
  readonly code = 'EBUSY' as const;

  constructor(
    public readonly path: string,
    public readonly holderPid?: number,
  ) {
    super(
      `File is locked: ${path}${
        holderPid !== undefined ? ` (held by pid=${holderPid})` : ''
      }`,
    );
    this.name = 'StorageLockedError';
  }
}

/**
 * Minimal `fs.promises` surface that `atomicWrite` consumes. Mirrors the
 * subset we use so tests can substitute a fake without depending on
 * `vi.mock('node:fs')`.
 */
export interface AtomicWriteFsImpl {
  readonly open: (typeof nodeFs)['open'];
  readonly rename: (typeof nodeFs)['rename'];
  readonly unlink: (typeof nodeFs)['unlink'];
}

/**
 * Structural event sink — accepts arbitrary `(type, payload)` pairs. Kept as
 * a minimal interface so consumers can inject their own event bus (or `null`)
 * without `atomic_write.ts` taking on a sibling import to the EventBus class.
 */
export interface AtomicWriteEventSink {
  emit(type: string, payload: Record<string, unknown>): void;
}

export interface AtomicWriteOptions {
  /** chmod-style mode bits applied via `fs.open(..., 'w', mode)`. */
  readonly mode?: number;
  /** Skip `fsync()` (e.g. tests on slow disks). Default: `true`. */
  readonly fsync?: boolean;
  /** Optional event sink — receives `StorageFull` / `StorageLocked` / `StoragePermissionDenied`. */
  readonly eventBus?: AtomicWriteEventSink;
  /** Filesystem implementation override (fault-injection in tests). */
  readonly fs?: AtomicWriteFsImpl;
}

/**
 * Compute the byte length the caller intends to write.
 */
function bytesOf(data: Buffer | Uint8Array | string): number {
  if (typeof data === 'string') return Buffer.byteLength(data);
  return data.byteLength;
}

/**
 * Atomically write `data` to `filePath`.
 *
 * Protocol (per data.md §5):
 *   1. Open `<filePath>.tmp.<pid>.<ts>.<rand>` with mode `'w'`.
 *   2. Write the full payload.
 *   3. `fsync()` (configurable for tests).
 *   4. `rename()` over `filePath` — atomic on POSIX and on NTFS for same-volume
 *      moves. The rename + fsync ordering is what guarantees crash-consistency.
 *
 * On failure we close the temp handle, unlink the temp file, and translate the
 * underlying `errno`:
 *   - `ENOSPC` → `StorageFullError`     + `StorageFull` event
 *   - `EBUSY`  → `StorageLockedError`   + `StorageLocked` event
 *   - `EACCES` / `EPERM` → `StoragePermissionError` + `StoragePermissionDenied` event
 *   - anything else: re-thrown verbatim.
 */
export async function atomicWrite(
  filePath: string,
  data: Buffer | Uint8Array | string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const fs: AtomicWriteFsImpl = options.fs ?? nodeFs;
  const fsync = options.fsync !== false;
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  let tempFd: Awaited<ReturnType<(typeof nodeFs)['open']>> | null = null;
  try {
    tempFd = await fs.open(tempPath, 'w', options.mode);
    await tempFd.writeFile(data);
    if (fsync) await tempFd.sync();
    await tempFd.close();
    tempFd = null;
    await fs.rename(tempPath, filePath);
  } catch (err: unknown) {
    if (tempFd !== null) {
      try {
        await tempFd.close();
      } catch {
        // best-effort cleanup
      }
    }
    try {
      await fs.unlink(tempPath);
    } catch {
      // temp file may not exist if open() itself failed — ignore
    }

    const e = err as NodeJS.ErrnoException;
    const ts = new Date().toISOString();
    if (e.code === 'ENOSPC') {
      const bytes = bytesOf(data);
      options.eventBus?.emit('StorageFull', {
        path: filePath,
        bytes_attempted: bytes,
        ts,
      });
      throw new StorageFullError(filePath, bytes);
    }
    if (e.code === 'EBUSY') {
      options.eventBus?.emit('StorageLocked', {
        path: filePath,
        ts,
      });
      throw new StorageLockedError(filePath);
    }
    if (e.code === 'EACCES' || e.code === 'EPERM') {
      options.eventBus?.emit('StoragePermissionDenied', {
        path: filePath,
        operation: 'write',
        ts,
      });
      throw new StoragePermissionError(filePath, 'write');
    }
    throw err;
  }
}
