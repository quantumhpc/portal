/**
 * Alert/Notification System
 * Manages user notifications stored in MongoDB.
 * Ported from libs/alerts.js
 */

import { getDb, ensureIndexes } from './db/connection';

const ALERT_COLLECTION = 'alerts';
const MAX_ALERTS = 20;

ensureIndexes(ALERT_COLLECTION, {
  userId: 1,
  date: -1,
});

export async function getAlerts(userId: string): Promise<any[]> {
  const db = await getDb();
  const collection = db.collection(ALERT_COLLECTION);

  return collection
    .find({ userId: userId.toString() })
    .sort({ date: -1 })
    .limit(MAX_ALERTS)
    .toArray();
}

export async function saveAlert(
  userId: string,
  alertType: string,
  alertMsg: string
): Promise<string> {
  const db = await getDb();
  const collection = db.collection(ALERT_COLLECTION);

  await collection.insertOne({
    userId: userId.toString(),
    type: alertType,
    message: alertMsg,
    date: new Date(),
  });

  // Auto-cleanup if too many alerts
  const count = await collection.countDocuments({ userId: userId.toString() });
  if (count > MAX_ALERTS * 1.5) {
    const oldest = await collection
      .find({ userId: userId.toString() })
      .sort({ date: -1 })
      .skip(MAX_ALERTS)
      .limit(1)
      .toArray();

    if (oldest.length > 0) {
      await collection.deleteMany({
        userId: userId.toString(),
        date: { $lt: oldest[0].date },
      });
    }
  }

  return 'Alert saved';
}

export async function deleteAlert(
  userId: string,
  filters: { alertId?: string; olderThan?: Date }
): Promise<string> {
  const db = await getDb();
  const collection = db.collection(ALERT_COLLECTION);

  const query: any = { userId: userId.toString() };
  if (filters.alertId) {
    const { ObjectId } = await import('mongodb');
    query._id = new ObjectId(filters.alertId);
  }
  if (filters.olderThan) {
    query.date = { $lt: filters.olderThan };
  }

  await collection.deleteMany(query);
  return 'Alert deleted';
}

/** Clean up alerts older than 24 hours */
export async function cleanupAlerts(): Promise<void> {
  const db = await getDb();
  const collection = db.collection(ALERT_COLLECTION);

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  await collection.deleteMany({ date: { $lt: cutoff } });
}
