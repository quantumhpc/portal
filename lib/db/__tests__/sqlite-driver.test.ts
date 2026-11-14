import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteDb } from "../sqlite-driver";

// Open a fresh in-memory database for each test suite
let db: Database.Database;
let col: ReturnType<SqliteDb["collection"]>;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  const sqliteDb = new SqliteDb(db);
  col = sqliteDb.collection("items");
});

afterEach(() => {
  db.close();
});

describe("insertOne / findOne", () => {
  it("inserts and retrieves a document by _id", async () => {
    await col.insertOne({ _id: "abc", name: "test", value: 42 });
    const doc = await col.findOne({ _id: "abc" });
    expect(doc).not.toBeNull();
    expect((doc as any).name).toBe("test");
    expect((doc as any).value).toBe(42);
  });

  it("returns null when not found", async () => {
    const doc = await col.findOne({ _id: "missing" });
    expect(doc).toBeNull();
  });

  it("supports nested field queries", async () => {
    await col.insertOne({ _id: "u1", admin: { isAdmin: true, active: true } });
    const doc = await col.findOne({ "admin.isAdmin": true });
    expect((doc as any)._id).toBe("u1");
  });
});

describe("find", () => {
  beforeEach(async () => {
    await col.insertOne({ _id: "1", cat: "A", score: 10 });
    await col.insertOne({ _id: "2", cat: "B", score: 20 });
    await col.insertOne({ _id: "3", cat: "A", score: 30 });
  });

  it("returns all docs without filter", async () => {
    const docs = await col.find({}).toArray();
    expect(docs.length).toBe(3);
  });

  it("filters by equality", async () => {
    const docs = await col.find({ cat: "A" }).toArray();
    expect(docs.length).toBe(2);
  });

  it("supports $in operator", async () => {
    const docs = await col.find({ _id: { $in: ["1", "3"] } }).toArray();
    expect(docs.length).toBe(2);
  });

  it("supports $gt operator", async () => {
    const docs = await col.find({ score: { $gt: 15 } }).toArray();
    expect(docs.length).toBe(2);
  });

  it("supports $ne operator", async () => {
    const docs = await col.find({ cat: { $ne: "A" } }).toArray();
    expect(docs.length).toBe(1);
    expect((docs[0] as any).cat).toBe("B");
  });

  it("supports sort and limit", async () => {
    const docs = await col.find({}).sort({ score: -1 }).limit(2).toArray();
    expect(docs.length).toBe(2);
    expect((docs[0] as any).score).toBe(30);
  });
});

describe("updateOne", () => {
  it("updates a field with $set", async () => {
    await col.insertOne({ _id: "x", status: "active" });
    await col.updateOne({ _id: "x" }, { $set: { status: "inactive" } });
    const doc = await col.findOne({ _id: "x" });
    expect((doc as any).status).toBe("inactive");
  });

  it("does not affect other documents", async () => {
    await col.insertOne({ _id: "y1", v: 1 });
    await col.insertOne({ _id: "y2", v: 1 });
    await col.updateOne({ _id: "y1" }, { $set: { v: 99 } });
    const other = await col.findOne({ _id: "y2" });
    expect((other as any).v).toBe(1);
  });
});

describe("deleteOne / findOneAndDelete", () => {
  it("removes a document", async () => {
    await col.insertOne({ _id: "del1", x: 1 });
    await col.deleteOne({ _id: "del1" });
    expect(await col.findOne({ _id: "del1" })).toBeNull();
  });

  it("findOneAndDelete returns the deleted document", async () => {
    await col.insertOne({ _id: "del2", x: 2 });
    const deleted = await col.findOneAndDelete({ _id: "del2" });
    expect((deleted as any).x).toBe(2);
    expect(await col.findOne({ _id: "del2" })).toBeNull();
  });
});

describe("countDocuments", () => {
  it("counts all docs", async () => {
    await col.insertOne({ _id: "c1", t: 1 });
    await col.insertOne({ _id: "c2", t: 2 });
    expect(await col.countDocuments({})).toBe(2);
  });

  it("counts with filter", async () => {
    await col.insertOne({ _id: "c3", t: 1 });
    await col.insertOne({ _id: "c4", t: 2 });
    expect(await col.countDocuments({ t: 1 })).toBe(1);
  });
});
