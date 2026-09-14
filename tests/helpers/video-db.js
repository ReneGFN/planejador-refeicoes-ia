import { readFileSync } from 'node:fs';
import { historyDb } from './history-db.js';

export function videoDb() {
  const DB = historyDb();
  DB.sqlite.exec(readFileSync(new URL('../../migrations/0007_video_cache_quota.sql', import.meta.url), 'utf8'));
  const batch = DB.batch.bind(DB);
  // D1 serializa cada batch atômico; o adaptador em memória precisa fazer o mesmo.
  let queue = Promise.resolve();
  DB.batch = statements => {
    const pending = queue.then(() => batch(statements));
    queue = pending.catch(() => {});
    return pending;
  };
  return DB;
}
