import { initDb } from '../db/registro';

export async function wasSent(eventId: string, startKey: string, kind: string) {
  const db = await initDb();
  const row = await db.get(
    `SELECT 1 FROM sent_reminders_kinds WHERE event_id = ? AND start_time = ? AND kind = ? LIMIT 1`,
    [eventId, startKey, kind]
  );
  return !!row;
}

export async function markSent(eventId: string, startKey: string, kind: string) {
  const db = await initDb();
  await db.run(
    `INSERT OR IGNORE INTO sent_reminders_kinds (event_id, start_time, kind) VALUES (?, ?, ?)`,
    [eventId, startKey, kind]
  );
}
