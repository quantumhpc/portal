import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteDb, newSqliteId } from '../sqlite-driver';

let db: SqliteDb;
vi.mock('../connection', () => ({
  getDb: async () => db,
  ensureIndexes: async () => {},
  newId: (id?: string) => newSqliteId(id),
}));

const { saveRun, listSavedRuns, getSavedRun, deleteSavedRun } = await import('../saved-runs');

const run = { name: 'Nightly', appDomain: 'demo', appName: 'residual_demo', type: 'batch', jobArgs: { numProcs: 4 } };

beforeEach(() => {
  db = new SqliteDb(new Database(':memory:'));
});

describe('saved runs', () => {
  it('belong to one user', async () => {
    const saved = await saveRun('alice', run);
    expect(await listSavedRuns('alice')).toHaveLength(1);
    expect(await listSavedRuns('bob')).toHaveLength(0);
    expect(await getSavedRun('bob', saved._id)).toBeNull();
    expect(await deleteSavedRun('bob', saved._id)).toBe(false);
    expect((await getSavedRun('alice', saved._id))?.jobArgs).toEqual({ numProcs: 4 });
    expect(await deleteSavedRun('alice', saved._id)).toBe(true);
    expect(await listSavedRuns('alice')).toHaveLength(0);
  });

  it('rejects bad input', async () => {
    await expect(saveRun('alice', { ...run, name: ' ' })).rejects.toThrow(/name/);
    await expect(saveRun('alice', { ...run, type: 'x' })).rejects.toThrow(/type/);
    await expect(saveRun('alice', { ...run, jobArgs: { big: 'x'.repeat(20000) } })).rejects.toThrow(/too large/);
    expect(await getSavedRun('alice', '../etc')).toBeNull();
  });
});
