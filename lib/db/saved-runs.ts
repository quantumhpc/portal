/**
 * Saved runs: a named copy of a job form (application + field values) that a
 * user can start again. Owned by one user; nothing here submits a job, the form
 * goes through the normal submit path and its checks.
 */

import { getDb, ensureIndexes, newId } from './connection';

const COLLECTION = 'saved_runs';
const MAX_PER_USER = 100;
const MAX_ARGS_BYTES = 16 * 1024;

ensureIndexes(COLLECTION, { userId: 1 });

export interface SavedRun {
  _id: string;
  userId: string;
  name: string;
  appDomain: string;
  appName: string;
  type: string;
  jobArgs: Record<string, unknown>;
  createdAt: Date;
}

export class SavedRunError extends Error {}

const ID = /^[0-9a-f]{24}$/;

const show = (r: any): SavedRun => ({ ...r, _id: String(r._id) });

export async function listSavedRuns(userId: string): Promise<SavedRun[]> {
  const db = await getDb();
  const rows = await db.collection(COLLECTION).find({ userId }).sort({ createdAt: -1 }).limit(MAX_PER_USER).toArray();
  return rows.map(show);
}

export async function getSavedRun(userId: string, id: string): Promise<SavedRun | null> {
  if (!ID.test(id)) return null;
  const db = await getDb();
  const row = await db.collection(COLLECTION).findOne({ _id: newId(id), userId });
  return row ? show(row) : null;
}

export async function saveRun(
  userId: string,
  run: { name: unknown; appDomain: unknown; appName: unknown; type: unknown; jobArgs: unknown },
): Promise<SavedRun> {
  const name = typeof run.name === 'string' ? run.name.trim() : '';
  if (!name || name.length > 80) throw new SavedRunError('Give the set-up a name (80 characters at most)');
  if (typeof run.appDomain !== 'string' || typeof run.appName !== 'string') throw new SavedRunError('Unknown application');
  if (run.type !== 'batch' && run.type !== 'remote') throw new SavedRunError('Unknown job type');
  if (!run.jobArgs || typeof run.jobArgs !== 'object' || Array.isArray(run.jobArgs)) throw new SavedRunError('No form values');
  if (JSON.stringify(run.jobArgs).length > MAX_ARGS_BYTES) throw new SavedRunError('Form values are too large to save');

  const db = await getDb();
  const col = db.collection(COLLECTION);
  if ((await col.countDocuments({ userId })) >= MAX_PER_USER) {
    throw new SavedRunError(`You already have ${MAX_PER_USER} saved set-ups; delete one first`);
  }
  const doc = {
    _id: newId(),
    userId,
    name,
    appDomain: run.appDomain,
    appName: run.appName,
    type: run.type,
    jobArgs: run.jobArgs as Record<string, unknown>,
    createdAt: new Date(),
  };
  await col.insertOne(doc);
  return show(doc);
}

export async function deleteSavedRun(userId: string, id: string): Promise<boolean> {
  if (!ID.test(id)) return false;
  const db = await getDb();
  const res = await db.collection(COLLECTION).deleteOne({ _id: newId(id), userId });
  return res.deletedCount > 0;
}
