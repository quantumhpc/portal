/**
 * Append-only audit log for admin mutations.
 * Schema is intentionally narrow — extend `details` for op-specific data.
 */

import { getDb, ensureIndexes } from "@/lib/db/connection";
import { log } from "@/lib/log";

const AUDIT_COLLECTION = "audit";

ensureIndexes(AUDIT_COLLECTION, { actorId: 1, at: -1 });

export interface AuditEntry {
  actorId: string;
  actorEmail?: string;
  action: string;          // e.g. "user.create", "user.delete"
  target?: string;         // id of affected entity
  details?: Record<string, any>;
  at: Date;
}

export async function logAudit(entry: Omit<AuditEntry, "at">): Promise<void> {
  try {
    const db = await getDb();
    await db.collection(AUDIT_COLLECTION).insertOne({ ...entry, at: new Date() });
  } catch (err) {
    // Auditing must never break a mutation — log and move on.
    log.error({ err, entry }, "audit: failed to record entry");
  }
}

export async function recentAudit(limit = 100): Promise<AuditEntry[]> {
  const db = await getDb();
  return db.collection(AUDIT_COLLECTION)
    .find({})
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
}
