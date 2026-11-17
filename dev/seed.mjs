#!/usr/bin/env node
/**
 * SQLite dev seed.
 * Creates dev/qhpc.sqlite with a minimal admin record for the current OS user.
 * Authentication is PAM-based; the DB holds only admin flags + display metadata.
 *
 * Override via env:
 *   SQLITE_FILE   — sqlite file path  (default: dev/qhpc.sqlite)
 *   ADMIN_USER    — system username to pre-authorise as admin (default: current user)
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectDir = path.dirname(__dirname);

const file =
  process.env.SQLITE_FILE || path.join(projectDir, "dev", "qhpc.sqlite");
const adminUser = process.env.ADMIN_USER || os.userInfo().username;

fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new Database(file);
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS "users" (_id TEXT PRIMARY KEY, doc TEXT NOT NULL)`);

// Remove any existing record for this username.
const all = db.prepare(`SELECT _id, doc FROM "users"`).all();
const existing = all.find((r) => {
  try { return JSON.parse(r.doc)?.username === adminUser; } catch { return false; }
});
if (existing) {
  db.prepare(`DELETE FROM "users" WHERE _id = ?`).run(existing._id);
}

const _id = crypto.randomBytes(12).toString("hex");
const doc = {
  username:    adminUser,
  displayName: adminUser,
  admin:       { isAdmin: true, active: true },
  properties:  { version: "0.0.0-dev" },
};

db.prepare(`INSERT INTO "users" (_id, doc) VALUES (?, ?)`).run(_id, JSON.stringify(doc));
db.close();

console.log("==> SQLite seed complete");
console.log(`    file:      ${file}`);
console.log(`    adminUser: ${adminUser}`);
console.log(`    Login with your OS credentials (PAM) — no DB password stored.`);
