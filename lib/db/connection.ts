import { MongoClient, Db, ObjectId } from "mongodb";
import config from "@/lib/config";
import { openSqliteDb, newSqliteId, type SqliteDb } from "./sqlite-driver";
import { log } from "@/lib/log";

type AnyDb = Db | SqliteDb;

interface DbState {
  client: MongoClient | null;
  db: AnyDb | null;
  connectionPromise: Promise<AnyDb> | null;
}

const state: DbState = {
  client: null,
  db: null,
  connectionPromise: null,
};

// Singleton connection — reuse across hot reloads in dev.
const globalForDb = globalThis as typeof globalThis & {
  _qhpcDbState?: DbState;
};

function getState(): DbState {
  if (config.isDev) {
    if (!globalForDb._qhpcDbState) globalForDb._qhpcDbState = state;
    return globalForDb._qhpcDbState;
  }
  return state;
}

export const dbDriver: "mongo" | "sqlite" = config.dbConfig.driver === "sqlite" ? "sqlite" : "mongo";

export async function getDb(): Promise<any> {
  const s = getState();
  if (s.db) return s.db;

  if (!s.connectionPromise) {
    if (dbDriver === "sqlite") {
      s.connectionPromise = Promise.resolve(openSqliteDb(config.dbConfig.file)).then((db) => {
        s.db = db;
        return db;
      });
    } else {
      s.connectionPromise = MongoClient.connect(config.dbConfig.url)
        .then((client) => {
          s.client = client;
          const db = client.db(config.dbConfig.database);
          s.db = db;
          log.info({ db: config.dbConfig.database }, "Connected to MongoDB");
          return db;
        })
        .catch((err) => {
          s.connectionPromise = null;
          log.error({ err }, "Cannot connect to MongoDB");
          throw err;
        });
    }
  }

  return s.connectionPromise;
}

/** ID factory that matches the active driver. */
export function newId(id?: string): any {
  if (dbDriver === "sqlite") return newSqliteId(id);
  return new ObjectId(id);
}

export async function closeDb(): Promise<void> {
  const s = getState();
  if (s.client) {
    await s.client.close();
  } else if (s.db && typeof (s.db as any).close === "function") {
    (s.db as any).close();
  }
  s.client = null;
  s.db = null;
  s.connectionPromise = null;
}

export async function ensureIndexes(
  collection: string,
  indexList: Record<string, 1 | -1>
): Promise<void> {
  try {
    const db = await getDb();
    const result = await db.collection(collection).createIndex(indexList);
    log.debug({ collection, result }, "Index created");
  } catch (err) {
    log.error({ collection, err }, "Error creating index");
  }
}
