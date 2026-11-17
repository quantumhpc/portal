/**
 * SQLite-backed shim of the subset of the MongoDB native driver actually used
 * by this project. Each "collection" is a single SQLite table:
 *
 *     CREATE TABLE <name> (_id TEXT PRIMARY KEY, doc TEXT NOT NULL)
 *
 * Documents are stored as JSON; nested-path queries use `json_extract`.
 *
 * Supported subset:
 *   - find / findOne with projection, sort, skip, limit
 *   - insertOne, updateOne, updateMany, findOneAndUpdate, findOneAndDelete
 *   - deleteOne, deleteMany, countDocuments
 *   - createIndex
 *   - filters: equality (incl. nested 'a.b'), $in, $lt, $lte, $gt, $gte, $ne
 *   - update operators: $set, $unset
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function reviver(_k: string, v: unknown) {
  if (typeof v === "string" && ISO_DATE.test(v)) return new Date(v);
  return v;
}

function parseDoc(raw: string): Record<string, any> {
  return JSON.parse(raw, reviver);
}

function stringify(doc: any): string {
  // Dates serialize to ISO strings via Date.prototype.toJSON
  return JSON.stringify(doc);
}

function idToString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v.toHexString === "function") return v.toHexString();
  if (typeof v.toString === "function") return v.toString();
  return String(v);
}

function scalarize(v: any): string | number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function jpath(key: string): string {
  return "$." + key;
}

function getPath(obj: any, p: string): any {
  return p.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
}

function setPath(obj: any, p: string, v: any): void {
  const parts = p.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = v;
}

function deletePath(obj: any, p: string): void {
  const parts = p.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null) return;
    cur = cur[parts[i]];
  }
  if (cur != null) delete cur[parts[parts.length - 1]];
}

interface Compiled {
  sql: string;
  params: any[];
}

function compileFilter(filter: any): Compiled {
  if (!filter || Object.keys(filter).length === 0) return { sql: "1=1", params: [] };
  const clauses: string[] = [];
  const params: any[] = [];

  for (const key of Object.keys(filter)) {
    const v = filter[key];

    if (key === "_id") {
      if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && !v.toHexString && Object.keys(v).some(k => k.startsWith("$"))) {
        // operators on _id, e.g. { $in: [...] }
        for (const op of Object.keys(v)) {
          if (op === "$in") {
            const arr = (v[op] as any[]).map(idToString);
            clauses.push(`_id IN (${arr.map(() => "?").join(",")})`);
            params.push(...arr);
          } else if (op === "$ne") {
            clauses.push(`_id != ?`);
            params.push(idToString(v[op]));
          }
        }
      } else {
        clauses.push("_id = ?");
        params.push(idToString(v));
      }
      continue;
    }

    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) &&
        Object.keys(v).some(k => k.startsWith("$"))) {
      const p = jpath(key);
      for (const op of Object.keys(v)) {
        const opVal = (v as any)[op];
        switch (op) {
          case "$in": {
            const arr = opVal as any[];
            clauses.push(`json_extract(doc, ?) IN (${arr.map(() => "?").join(",")})`);
            params.push(p, ...arr.map(scalarize));
            break;
          }
          case "$lt":  clauses.push(`json_extract(doc, ?) < ?`);  params.push(p, scalarize(opVal)); break;
          case "$lte": clauses.push(`json_extract(doc, ?) <= ?`); params.push(p, scalarize(opVal)); break;
          case "$gt":  clauses.push(`json_extract(doc, ?) > ?`);  params.push(p, scalarize(opVal)); break;
          case "$gte": clauses.push(`json_extract(doc, ?) >= ?`); params.push(p, scalarize(opVal)); break;
          case "$ne":  clauses.push(`json_extract(doc, ?) != ?`); params.push(p, scalarize(opVal)); break;
          default:
            throw new Error(`sqlite-driver: unsupported operator ${op}`);
        }
      }
    } else {
      clauses.push(`json_extract(doc, ?) = ?`);
      params.push(jpath(key), scalarize(v));
    }
  }
  return { sql: clauses.join(" AND "), params };
}

function compileSort(sort: Record<string, 1 | -1>): Compiled {
  const parts: string[] = [];
  const params: string[] = [];
  for (const k of Object.keys(sort)) {
    const dir = sort[k] === 1 ? "ASC" : "DESC";
    if (k === "_id") {
      parts.push(`_id ${dir}`);
    } else {
      parts.push(`json_extract(doc, ?) ${dir}`);
      params.push(jpath(k));
    }
  }
  return { sql: parts.length ? "ORDER BY " + parts.join(",") : "", params };
}

function applyProjection(doc: any, projection?: Record<string, 0 | 1>): any {
  if (!projection || Object.keys(projection).length === 0) return doc;
  const isInclude = Object.values(projection).some(v => v === 1);
  if (isInclude) {
    const out: any = { _id: doc._id };
    for (const p of Object.keys(projection)) {
      if (projection[p] === 1) setPath(out, p, getPath(doc, p));
    }
    return out;
  }
  const cloned = JSON.parse(JSON.stringify(doc), reviver);
  for (const p of Object.keys(projection)) {
    if (projection[p] === 0) deletePath(cloned, p);
  }
  return cloned;
}

function applyUpdate(existing: any, update: any): any {
  const hasOps = Object.keys(update).some(k => k.startsWith("$"));
  if (!hasOps) {
    return { _id: existing._id, ...update };
  }
  const next = JSON.parse(JSON.stringify(existing), reviver);
  if (update.$set) {
    for (const p of Object.keys(update.$set)) setPath(next, p, update.$set[p]);
  }
  if (update.$unset) {
    for (const p of Object.keys(update.$unset)) deletePath(next, p);
  }
  if (update.$inc) {
    for (const p of Object.keys(update.$inc)) {
      const cur = Number(getPath(next, p) ?? 0);
      setPath(next, p, cur + Number(update.$inc[p]));
    }
  }
  return next;
}

function newObjectIdHex(): string {
  return crypto.randomBytes(12).toString("hex");
}

class SqliteCollection {
  constructor(private db: Database.Database, public name: string) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS "${name}" (_id TEXT PRIMARY KEY, doc TEXT NOT NULL)`
    );
  }

  private rowToDoc(row: { _id: string; doc: string }): any {
    const d = parseDoc(row.doc);
    d._id = row._id;
    return d;
  }

  find(filter: any = {}): SqliteCursor {
    return new SqliteCursor(this, filter);
  }

  async findOne(filter: any = {}): Promise<any | null> {
    const cur = new SqliteCursor(this, filter).limit(1);
    const arr = await cur.toArray();
    return arr[0] ?? null;
  }

  async insertOne(doc: any): Promise<{ insertedId: string; acknowledged: true }> {
    const _id = idToString(doc._id) || newObjectIdHex();
    const stored = { ...doc };
    delete stored._id;
    this.db.prepare(`INSERT INTO "${this.name}" (_id, doc) VALUES (?, ?)`).run(_id, stringify(stored));
    return { insertedId: _id, acknowledged: true };
  }

  async insertMany(docs: any[]): Promise<{ insertedIds: Record<number, string>; acknowledged: true }> {
    const insertedIds: Record<number, string> = {};
    const stmt = this.db.prepare(`INSERT INTO "${this.name}" (_id, doc) VALUES (?, ?)`);
    const tx = this.db.transaction((rows: any[]) => {
      rows.forEach((d, i) => {
        const _id = idToString(d._id) || newObjectIdHex();
        const stored = { ...d };
        delete stored._id;
        stmt.run(_id, stringify(stored));
        insertedIds[i] = _id;
      });
    });
    tx(docs);
    return { insertedIds, acknowledged: true };
  }

  async updateOne(filter: any, update: any): Promise<{ matchedCount: number; modifiedCount: number; acknowledged: true }> {
    const found = await this.findOne(filter);
    if (!found) return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
    const next = applyUpdate(found, update);
    const _id = idToString(next._id || found._id);
    const stored = { ...next };
    delete stored._id;
    this.db.prepare(`UPDATE "${this.name}" SET doc = ? WHERE _id = ?`).run(stringify(stored), _id);
    return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
  }

  async updateMany(filter: any, update: any): Promise<{ matchedCount: number; modifiedCount: number; acknowledged: true }> {
    const docs = await this.find(filter).toArray();
    const stmt = this.db.prepare(`UPDATE "${this.name}" SET doc = ? WHERE _id = ?`);
    const tx = this.db.transaction((rows: any[]) => {
      rows.forEach(d => {
        const next = applyUpdate(d, update);
        const stored = { ...next };
        delete stored._id;
        stmt.run(stringify(stored), idToString(d._id));
      });
    });
    tx(docs);
    return { matchedCount: docs.length, modifiedCount: docs.length, acknowledged: true };
  }

  async findOneAndUpdate(filter: any, update: any, opts: { returnDocument?: "before" | "after" } = {}): Promise<any> {
    const found = await this.findOne(filter);
    if (!found) return null;
    const next = applyUpdate(found, update);
    const stored = { ...next };
    delete stored._id;
    this.db.prepare(`UPDATE "${this.name}" SET doc = ? WHERE _id = ?`).run(stringify(stored), idToString(found._id));
    return opts.returnDocument === "before" ? found : next;
  }

  async findOneAndDelete(filter: any): Promise<any> {
    const found = await this.findOne(filter);
    if (!found) return null;
    this.db.prepare(`DELETE FROM "${this.name}" WHERE _id = ?`).run(idToString(found._id));
    return found;
  }

  async deleteOne(filter: any): Promise<{ deletedCount: number; acknowledged: true }> {
    const found = await this.findOne(filter);
    if (!found) return { deletedCount: 0, acknowledged: true };
    this.db.prepare(`DELETE FROM "${this.name}" WHERE _id = ?`).run(idToString(found._id));
    return { deletedCount: 1, acknowledged: true };
  }

  async deleteMany(filter: any): Promise<{ deletedCount: number; acknowledged: true }> {
    const { sql, params } = compileFilter(filter);
    const res = this.db.prepare(`DELETE FROM "${this.name}" WHERE ${sql}`).run(...params);
    return { deletedCount: Number(res.changes), acknowledged: true };
  }

  async countDocuments(filter: any = {}): Promise<number> {
    const { sql, params } = compileFilter(filter);
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM "${this.name}" WHERE ${sql}`).get(...params) as { c: number };
    return row.c;
  }

  async createIndex(spec: Record<string, 1 | -1>): Promise<string> {
    const cols: string[] = [];
    const nameParts: string[] = [];
    for (const k of Object.keys(spec)) {
      if (k === "_id") {
        cols.push("_id");
      } else {
        cols.push(`json_extract(doc, '${jpath(k)}')`);
      }
      nameParts.push(k.replace(/[^a-zA-Z0-9]/g, "_"));
    }
    const idxName = `idx_${this.name}_${nameParts.join("_")}`;
    this.db.exec(`CREATE INDEX IF NOT EXISTS "${idxName}" ON "${this.name}" (${cols.join(",")})`);
    return idxName;
  }

  // Internal — used by the cursor.
  _query(filter: any, sort: Record<string, 1 | -1> | null, skip: number, limit: number): any[] {
    const f = compileFilter(filter);
    const s = sort ? compileSort(sort) : { sql: "", params: [] as any[] };
    let sql = `SELECT _id, doc FROM "${this.name}" WHERE ${f.sql} ${s.sql}`;
    const params = [...f.params, ...s.params];
    if (limit > 0) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }
    if (skip > 0) {
      // SQLite requires LIMIT before OFFSET
      if (limit <= 0) sql += ` LIMIT -1`;
      sql += ` OFFSET ?`;
      params.push(skip);
    }
    const rows = this.db.prepare(sql).all(...params) as { _id: string; doc: string }[];
    return rows.map(r => this.rowToDoc(r));
  }
}

class SqliteCursor {
  private _projection?: Record<string, 0 | 1>;
  private _sort: Record<string, 1 | -1> | null = null;
  private _skip = 0;
  private _limit = 0;

  constructor(private coll: SqliteCollection, private filter: any) {}

  project(p: Record<string, 0 | 1>): this { this._projection = p; return this; }
  sort(s: Record<string, 1 | -1>): this { this._sort = s; return this; }
  skip(n: number): this { this._skip = n; return this; }
  limit(n: number): this { this._limit = n; return this; }

  async toArray(): Promise<any[]> {
    const docs = this.coll._query(this.filter, this._sort, this._skip, this._limit);
    return this._projection ? docs.map(d => applyProjection(d, this._projection)) : docs;
  }
}

export class SqliteDb {
  private collections = new Map<string, SqliteCollection>();
  constructor(public raw: Database.Database) {}

  collection<T = any>(name: string): SqliteCollection {
    let c = this.collections.get(name);
    if (!c) {
      c = new SqliteCollection(this.raw, name);
      this.collections.set(name, c);
    }
    return c;
  }

  close(): void {
    this.raw.close();
  }
}

let openHandle: SqliteDb | null = null;

export function openSqliteDb(file: string): SqliteDb {
  if (openHandle) return openHandle;
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const raw = new Database(file);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  openHandle = new SqliteDb(raw);
  console.log(`Connected to SQLite: ${file}`);
  return openHandle;
}

export function closeSqliteDb(): void {
  if (openHandle) {
    openHandle.close();
    openHandle = null;
  }
}

/** newId equivalent for SQLite mode — bare hex string. */
export function newSqliteId(id?: string): string {
  return id ?? newObjectIdHex();
}
