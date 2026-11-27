import type { Database } from 'sql.js';
import { accountPrefixes } from './database-accounts';

/** Read-only SQL view adapter. Exclusions never modify the selected database. */
export function withPersonExclusions(db: Database, account: string, excluded: readonly string[] = []): Database {
  if (!excluded.length) return db;
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const values = [...new Set(excluded)].map(id => `'${id.replaceAll("'", "''")}'`).join(',');
  const tables = new Map<string, string[]>([
    ['gamelog_join_leave', ['user_id']],
    ...['friend_log_current','friend_log_history','feed_online_offline','feed_avatar'].map(suffix => [`${account}_${suffix}`, ['user_id']] as [string, string[]]),
    [`${account}_mutual_graph_meta`, ['friend_id']],
    [`${account}_mutual_graph_links`, ['friend_id','mutual_id']],
    [`${account}_notifications`, ['sender_user_id']],
    [`${account}_notifications_v2`, ['sender_user_id']],
  ]);
  const pattern = new RegExp(`(?<![\\w])(?:"(${[...tables.keys()].join('|')})"|(${[...tables.keys()].join('|')}))(?![\\w])`, 'g');
  function filter(sql: string) {
    return sql.replace(pattern, (_match, quoted: string, bare: string) => {
      const table = quoted || bare;
      return `(SELECT * FROM "${table}" WHERE ${tables.get(table)!.map(column => `COALESCE("${column}",'') NOT IN (${values})`).join(' AND ')})`;
    });
  }
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare') return (sql: string, ...args: unknown[]) => target.prepare(filter(sql), ...args as []);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
