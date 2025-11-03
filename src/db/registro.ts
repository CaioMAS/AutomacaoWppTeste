import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function initDb() {
  const db = await open({
    filename: './reminders.sqlite',
    driver: sqlite3.Database,
  });

  // Agora salvamos também o horário do evento
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sent_reminders (
      event_id   TEXT NOT NULL,
      start_time TEXT NOT NULL,
      sent_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, start_time)
    )
  `);

    // 🔹 Nova tabela exclusiva para lembretes com tipo (24h, 10min, etc.)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sent_reminders_kinds (
      event_id   TEXT NOT NULL,
      start_time TEXT NOT NULL,
      kind       TEXT NOT NULL, -- '24h', '1h', '8h', ...
      sent_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, start_time, kind)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sent_reminders_kinds_unique
      ON sent_reminders_kinds (event_id, start_time, kind);
  `);

  return db;
}
