// src/core/reviews.js — owner of the <vault>/Reviews/ filesystem region.
//
// Phase 1 ships only the idempotent mkdir helper so Phase 3's self-review
// writer has a home to grow into. Per CONTEXT.md D-10, ensureReviewsDir takes
// vaultPath as an explicit parameter rather than calling getVaultPath() —
// this keeps the helper unit-testable without setting up module-level state
// (paths.js#activeVaultPath) and lets Phase 3's command call it from any
// context once the vaultPath is known.
//
// No other module may write to <vault>/Reviews/<*>.md. Phase 3 grows this
// module; downstream agents must extend it here, not in topics.js or logger.js.

import { mkdir } from 'fs/promises';
import { join } from 'path';

export async function ensureReviewsDir(vaultPath) {
  await mkdir(join(vaultPath, 'Reviews'), { recursive: true });
}
