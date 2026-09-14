// SQLite em memória do próprio Node: SQL real, sem dependência nova ou banco remoto.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function historyDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql', '0002_usage_reservations.sql', '0003_plan_history.sql', '0004_meal_logs.sql', '0005_pantry.sql', '0006_history_deletion.sql']) {
    sqlite.exec(readFileSync(new URL('../../migrations/' + file, import.meta.url), 'utf8'));
  }
  const trace = [];
  const db = { sqlite, trace, before: null,
    prepare(sql) {
      const parameters = args => args.length
        ? [Object.fromEntries(args.map((value, index) => [`?${index + 1}`, value]))] : [];
      const statement = (args = []) => ({
        bind: (...values) => statement(values),
        async first() {
          trace.push(sql); await db.before?.(sql);
          const row = sqlite.prepare(sql).get(...parameters(args));
          return row ? { ...row } : null;
        },
        async run() {
          trace.push(sql); await db.before?.(sql);
          const info = sqlite.prepare(sql).run(...parameters(args));
          return { success: true, meta: { changes: Number(info.changes) } };
        },
        async all() {
          trace.push(sql); await db.before?.(sql);
          return { success: true, results: sqlite.prepare(sql).all(...parameters(args)).map(row => ({ ...row })) };
        },
      });
      return statement();
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}
