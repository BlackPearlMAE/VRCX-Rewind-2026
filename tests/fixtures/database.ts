import { savedTimelineDemo } from '../../src/data/timeline-demo';
import { syntheticSessionDemo } from '../../src/data/session-demo';
import initSqlJs from 'sql.js';
const engine = initSqlJs();

export async function databaseFixture(kind: 'compatible' | 'unsupported' | 'unrelated' | 'benchmark' | 'multi-account' | 'old-version' | 'future-version' | 'missing-version' | 'invalid-version' | 'missing-configs' = 'compatible', version: 17 | 18 = 18): Promise<Buffer> {
  const SQL = await engine;
  const db = new SQL.Database();
  try {
    if (kind === 'unrelated') db.run('CREATE TABLE notes (body TEXT);');
    else {
      db.run(`CREATE TABLE gamelog_location (id INTEGER PRIMARY KEY, created_at TEXT, location TEXT, world_id TEXT, world_name TEXT${kind === 'unsupported' ? '' : ', time INTEGER'});
        CREATE TABLE cache_world (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE credentials (token TEXT);
        INSERT INTO credentials VALUES ('SYNTHETIC-DO-NOT-TRANSMIT');`);
      if (kind !== 'missing-configs') {
        db.run('CREATE TABLE configs (key TEXT PRIMARY KEY, value TEXT);');
        if (kind !== 'missing-version') db.run('INSERT INTO configs VALUES (?, ?)', ['config:vrcx_databaseversion', kind === 'old-version' ? '16' : kind === 'future-version' ? '19' : kind === 'invalid-version' ? '18oops' : String(version)]);
        db.run('INSERT INTO configs VALUES (?, ?)', ['config:unrelated-private-setting', 'SYNTHETIC-CONFIG-DO-NOT-TRANSMIT']);
      }
    }
    if (kind === 'benchmark' || kind === 'multi-account') {
      db.run(`CREATE TABLE gamelog_join_leave (id INTEGER PRIMARY KEY, user_id TEXT, display_name TEXT, created_at TEXT, location TEXT, type TEXT, time INTEGER);
        CREATE TABLE gamelog_event (id INTEGER PRIMARY KEY, created_at TEXT, data TEXT);
        CREATE TABLE cache_avatar (id TEXT, author_id TEXT, created_at TEXT);
        INSERT INTO gamelog_location VALUES (1, '2026-04-18T05:00:00.000Z', 'wrld_test:1', 'wrld_test', 'Synthetic world', 3600000);
        INSERT INTO gamelog_join_leave VALUES (1, 'usr_friend', 'Synthetic friend', '2026-04-18T05:30:00.000Z', 'wrld_test:1', 'OnPlayerLeft', 1800000);`);
      for (const suffix of kind === 'multi-account' ? ['1', '2'] : ['1']) {
        const account = 'usr' + suffix.repeat(32);
        db.run(`CREATE TABLE "${account}_friend_log_current" (user_id TEXT, display_name TEXT);
          CREATE TABLE "${account}_friend_log_history" (id INTEGER, user_id TEXT, type TEXT, created_at TEXT);
          CREATE TABLE "${account}_mutual_graph_meta" (friend_id TEXT, last_fetched_at TEXT, opted_out INTEGER);
          CREATE TABLE "${account}_mutual_graph_links" (friend_id TEXT, mutual_id TEXT);
          CREATE TABLE "${account}_notifications" (id TEXT, type TEXT, receiver_user_id TEXT, sender_user_id TEXT, created_at TEXT, image_url TEXT);
          CREATE TABLE "${account}_notifications_v2" (id TEXT, type TEXT, sender_user_id TEXT, created_at TEXT, image_url TEXT);
          INSERT INTO "${account}_friend_log_current" VALUES ('usr_friend', 'Synthetic friend');`);
      }
    }
    return Buffer.from(db.export());
  } finally { db.close(); }
}
export async function timelineBoundaryFixture(): Promise<Buffer> {
  const SQL = await engine;
  const db = new SQL.Database(await databaseFixture('benchmark'));
  try {
    db.run(`INSERT INTO gamelog_location VALUES
      (2, '2026-03-31T21:30:00.000Z', 'wrld_boundary:1', 'wrld_boundary', 'Month boundary', 3600000),
      (3, '2026-03-28T22:30:00.000Z', 'wrld_dst:1', 'wrld_dst', 'DST boundary', 10800000),
      (4, '2026-04-07T21:30:00.000Z', 'wrld_segment:1', 'wrld_segment', 'Section boundary', 3600000);`);
    return Buffer.from(db.export());
  } finally { db.close(); }
}

export async function friendsTimelineFixture(): Promise<Buffer> {
  const SQL = await engine;
  const db = new SQL.Database(await timelineBoundaryFixture());
  try {
    const table = 'usr11111111111111111111111111111111_friend_log_history';
    const rows = [
      ['usr_old', 'Friend', '2025-10-01T00:00:00.000Z'],
      ['usr_old', 'Friend', '2026-03-01T00:00:00.000Z'],
      ['usr_prior', 'Unfriend', '2025-10-01T00:00:00.000Z'],
      ['usr_prior', 'Friend', '2026-03-01T00:00:00.000Z'],
      ['usr_march', 'Friend', '2026-03-31T21:59:59.000Z'],
      ['usr_april', 'Friend', '2026-03-31T22:00:00.000Z'],
      ['usr_week_one', 'Friend', '2026-04-07T21:59:59.000Z'],
      ['usr_week_two', 'Friend', '2026-04-07T22:00:00.000Z'],
      ['usr_march', 'Unfriend', '2026-04-08T00:00:00.000Z'],
      ['usr_march', 'Friend', '2026-04-09T00:00:00.000Z'],
      ['usr_11111111-1111-1111-1111-111111111111', 'Friend', '2026-04-01T00:00:00.000Z'],
      ['not_a_user', 'Friend', '2026-04-01T00:00:00.000Z'],
      ['usr_tied', 'Unfriend', '2026-04-01T00:00:00.000Z'],
      ['usr_tied', 'Friend', '2026-04-01T00:00:00.000Z'],
      ['usr_other', 'DisplayName', '2026-04-01T00:00:00.000Z'],
    ];
    rows.forEach((row, index) => db.run(`INSERT INTO "${table}" (id, user_id, type, created_at) VALUES (?, ?, ?, ?)`, [index + 1, ...row]));
    return Buffer.from(db.export());
  } finally { db.close(); }
}

/** Rich session data for future time-played queries; leaves the existing tiny fixture unchanged. */
export async function sessionDatabaseFixture(): Promise<Buffer> {
  const SQL = await engine;
  const db = new SQL.Database(await databaseFixture('benchmark'));
  try {
    db.run('DELETE FROM gamelog_location; DELETE FROM gamelog_join_leave;');
    const sessions = syntheticSessionDemo(savedTimelineDemo()).sessions;
    const selfId = 'usr_11111111-1111-1111-1111-111111111111';
    for (const [index, session] of sessions.entries()) {
      const duration = Date.parse(session.endedAt) - Date.parse(session.startedAt);
      const world = `wrld_synthetic_${index % 6}`;
      const location = `${world}:synthetic-${index + 1}`;
      db.run('INSERT INTO gamelog_location VALUES (?, ?, ?, ?, ?, ?)', [index + 1, session.startedAt, location, world, `Synthetic world ${index % 6 + 1}`, duration]);
      db.run('INSERT INTO gamelog_join_leave VALUES (?, ?, ?, ?, ?, ?, ?)', [index * 2 + 1, selfId, 'Synthetic self', session.startedAt, location, 'OnPlayerJoined', 0]);
      db.run('INSERT INTO gamelog_join_leave VALUES (?, ?, ?, ?, ?, ?, ?)', [index * 2 + 2, selfId, 'Synthetic self', session.endedAt, location, 'OnPlayerLeft', duration]);
    }
    return Buffer.from(db.export());
  } finally { db.close(); }
}
