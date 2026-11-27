import type { Database } from 'sql.js';

export function accountPrefixes(db: Database): string[] {
  return (db.exec("SELECT name FROM sqlite_schema WHERE type='table'")[0]?.values ?? [])
    .map(row => String(row[0]).match(/^(usr[0-9a-f]{32})_friend_log_current$/)?.[1])
    .filter((name): name is string => !!name).sort();
}
