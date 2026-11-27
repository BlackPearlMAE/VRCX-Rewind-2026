import { ownShareProfile } from './own-avatar-query';
import { withPersonExclusions } from './person-exclusions';
import { calculateFriendsChapter, unavailableFriendsChapter } from './friends-chapter-query';
import { calculateWorlds } from './worlds-query';
import { unavailableWorlds } from './worlds-data';
import { calculateFriendImages, type FriendImageResult } from './friend-image-query';
import { calculateRecordPages } from './record-query';
import { unavailableRecords } from './record-pages';
import { calculateSessionCount, calculateTimeline, calculateFriendsTimeline, type TimelineLoadResult, type TimelineMetric } from './timeline-query';
import { accountPrefixes } from './database-accounts';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { DatabaseCheck } from './database-check';

const required: Record<string, string[]> = {
  gamelog_location: ['id', 'created_at', 'location', 'world_id', 'world_name', 'time'],
  cache_world: ['id', 'name'],
};
// Verified against VRCX v2026.11.14, src/stores/vrcx.js and src/services/config.js.
const supportedDatabaseVersion = 18;
const markers = ['gamelog_location', 'gamelog_join_leave', 'gamelog_event', 'cache_world'];
let initializeEngine: ((wasm?: ArrayBuffer) => void) | undefined;
const engine = new Promise<SqlJsStatic>((resolve, reject) => {
  initializeEngine = wasm => {
    if (!wasm) { reject(new Error('Local database engine unavailable')); return; }
    void initSqlJs({ wasmBinary: wasm }).then(resolve, reject);
  };
});
void engine.then(() => self.postMessage({ type: 'ready', ok: true }), () => self.postMessage({ type: 'ready', ok: false }));

let retainedDb: Database | undefined;

async function check(file: File): Promise<DatabaseCheck> {
  retainedDb?.close(); retainedDb = undefined;
  if (!file.size) return { ok: false, message: 'This file is empty. Choose your VRCX.sqlite3 database.' };
  let bytes: Uint8Array | undefined;
  let db: Database | undefined;
  try {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (new TextDecoder().decode(header) !== 'SQLite format 3\0') return { ok: false, message: 'This is not a SQLite database. Choose your VRCX.sqlite3 file.' };
    const SQL = await engine;
    bytes = new Uint8Array(await file.arrayBuffer());
    db = new SQL.Database(bytes);
    db.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
    const names = new Set(db.exec("SELECT name FROM sqlite_schema WHERE type = 'table'")[0]?.values.map(row => String(row[0])) ?? []);
    if (markers.filter(name => names.has(name)).length < 2) return { ok: false, message: 'This SQLite file does not have a recognized VRCX database layout.' };
    if (!names.has('configs')) return { ok: false, message: 'The VRCX database version is missing. Open this database in the current VRCX release, then close VRCX and select it again.' };
    // One known configuration key only. Never read or enumerate unrelated settings.
    const storedVersion = db.exec("SELECT value FROM configs WHERE key = 'config:vrcx_databaseversion' LIMIT 1")[0]?.values[0]?.[0];
    if (typeof storedVersion !== 'string' || !/^(0|[1-9][0-9]*)$/.test(storedVersion) || !Number.isSafeInteger(Number(storedVersion))) {
      return { ok: false, message: 'The VRCX database version is missing or invalid. Open this database in the current VRCX release, then close VRCX and select it again.' };
    }
    const databaseVersion = Number(storedVersion);
    if (databaseVersion < supportedDatabaseVersion) return { ok: false, message: `This VRCX database needs an update. Open it in the current VRCX release, let it finish updating, then close VRCX and select it again. This build supports database version ${supportedDatabaseVersion}.` };
    if (databaseVersion > supportedDatabaseVersion) return { ok: false, message: `This database uses a newer VRCX database version than this Rewind build supports. Use an updated Rewind build. Supported database version: ${supportedDatabaseVersion}.` };
    for (const [table, columns] of Object.entries(required)) {
      if (!names.has(table)) return { ok: false, message: 'This VRCX database layout is not supported by this build. Required activity tables are missing.' };
      // Names are fixed application constants, never file-provided SQL identifiers.
      const actual = new Set(db.exec(`PRAGMA table_info('${table}')`)[0]?.values.map(row => String(row[1])) ?? []);
      if (columns.some(column => !actual.has(column))) return { ok: false, message: 'This VRCX database layout is not supported by this build. Required activity fields are missing.' };
    }
    retainedDb = db;
    return { ok: true, message: 'Supported VRCX database version and activity layout found.', databaseVersion, profile: 'vrcx-activity-v1', accounts: accountPrefixes(db) };
  } catch {
    return { ok: false, message: 'This database could not be read. It may be damaged, encrypted, or an incomplete copy. Choose your VRCX.sqlite3 file again.' };
  } finally {
    try { if (db !== retainedDb) db?.close(); } finally { bytes?.fill(0); }
  }
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; file: File; type?: string; account?: string; metric?: TimelineMetric; excluded?: string[]; wasm?: ArrayBuffer; includePictures?: boolean }>) => {
  if (event.data.type === 'initialize') {
    initializeEngine?.(event.data.wasm); initializeEngine = undefined;
    return;
  }
  const { id, file } = event.data;
  queue = queue.then(async () => {
    if (event.data.type === 'share-profile') {
      let profile: ReturnType<typeof ownShareProfile> = { pictures: [] };
      try { if (retainedDb) profile = ownShareProfile(retainedDb, event.data.account ?? '', event.data.includePictures !== false); } catch { /* Optional history/cache. */ }
      self.postMessage({ type: 'share-profile', id, profile });
      return;
    }
    if (event.data.type === 'friend-images') {
      let result: FriendImageResult;
      try {
        if (!retainedDb) throw new Error('Database not loaded');
        result = calculateFriendImages(retainedDb, event.data.account ?? '');
      } catch { result = { ok: false, entries: [], message: 'Friend images could not be prepared from this database.' }; }
      self.postMessage({ type: 'friend-images', id, result });
      return;
    }
    if (event.data.type === 'friends') {
      let friends;
      try {
        if (!retainedDb) throw new Error('Database not loaded');
        friends = calculateFriendsChapter(withPersonExclusions(retainedDb, event.data.account ?? '', event.data.excluded), event.data.account ?? '');
      } catch { friends = unavailableFriendsChapter(); }
      self.postMessage({ type: 'friends', id, friends });
      return;
    }
    if (event.data.type === 'worlds') {
      let worlds;
      try {
        if (!retainedDb) throw new Error('Database not loaded');
        worlds = calculateWorlds(retainedDb, event.data.account ?? '');
      } catch { worlds = unavailableWorlds(); }
      self.postMessage({ type: 'worlds', id, worlds });
      return;
    }
    if (event.data.type === 'records') {
      let records;
      try {
        if (!retainedDb) throw new Error('Database not loaded');
        records = calculateRecordPages(withPersonExclusions(retainedDb, event.data.account ?? '', event.data.excluded), event.data.account ?? '');
      } catch { records = unavailableRecords('Records could not be calculated from this database.'); }
      self.postMessage({ type: 'records', id, records });
      return;
    }
    if (event.data.type === 'timeline') {
      let result: TimelineLoadResult;
      try {
        if (!retainedDb) throw new Error('Database not loaded');
        result = { ok: true, data: event.data.metric === 'friends-added' ? calculateFriendsTimeline(retainedDb, event.data.account ?? '') : calculateTimeline(retainedDb, event.data.account ?? ''), message: 'Timeline ready.' };
        if (event.data.metric !== 'friends-added') {
          try { result.sessionCount = calculateSessionCount(retainedDb, event.data.account ?? ''); } catch { /* Keep recorded hours available if session history is incomplete. */ }
        }
      } catch { result = { ok: false, message: event.data.metric === 'friends-added' ? 'Friends added could not be calculated. This database may be missing required friend history.' : 'Recorded time could not be calculated. This database may be missing required visit or player history.' }; }
      self.postMessage({ type: 'timeline', id, result });
      return;
    }
    if (event.data.type) return;
    const result = await check(file);
    self.postMessage({ type: 'result', id, result });
  });
};
