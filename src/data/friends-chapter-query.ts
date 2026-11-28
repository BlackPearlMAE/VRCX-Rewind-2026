import type { Database, SqlValue } from 'sql.js';
import { accountPrefixes } from './database-accounts';
import { recapQueries } from './recap-sql-catalog';
import { calendarMidnight } from './timeline-calendar';
import { calculateFriends } from './friends-query';
import { unavailableFriends, type FriendsPageData, type NewFriendEntry } from './friends-data';
import { friendsDefinitions, type FriendsId } from './friends-definitions';

export interface FriendsChapterFacts {
  coverage?: { userId: string; first: string | null; last: string | null }[];
  mutuals?: { coverageIds: string[]; friendIds: string[]; sharedByUser: Map<string, Set<string>> };
  applyNotifications?: (pages: FriendsPageData[], excluded: ReadonlySet<string>) => void;
  enrich?: (pages: FriendsPageData[]) => void;
}

export function presenceCoverageNote(first: string | null, last: string | null): string {
  return `Current friends; retained status history from ${String(first).slice(0,10)} to ${String(last).slice(0,10)}. Missing status changes can affect overlap.`;
}

export function unavailableFriendsChapter(): FriendsPageData[] {
  return friendsDefinitions.map(({ id }) => ({ ...unavailableFriends(), id }));
}

/** Recalculate the chapter from retained source history; never read derived activity caches. */
export function calculateFriendsChapter(db: Database, account: string, now = Date.now(), options: { all?: boolean; enrich?: boolean; facts?: FriendsChapterFacts } = {}): FriendsPageData[] {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const raw = account.slice(3);
  const self = `usr_${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
  const params: Record<string, string | number> = {
    ':self_id': self,
    ':from_utc': new Date(calendarMidnight(2026, 0, 1, 'Europe/Berlin')).toISOString(),
    ':to_utc': new Date(Math.min(now, calendarMidnight(2027, 0, 1, 'Europe/Berlin'))).toISOString(),
  };
  function query(sql: string, extra: Record<string, string> = {}): Record<string, SqlValue>[] {
    if (options.all) sql = sql.replace(/ LIMIT 10;\s*$/, ';');
    const statement = db.prepare(sql.replaceAll('{{account}}', account));
    try {
      statement.bind(Object.fromEntries(Object.entries({ ...params, ...extra }).filter(([key]) => sql.includes(key))));
      const rows: Record<string, SqlValue>[] = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally { statement.free(); }
  }
  const pages = unavailableFriendsChapter();
  pages[0] = { ...calculateFriends(db, account, now, options), id: 'added' };
  function safe(id: FriendsId, calculate: () => Omit<FriendsPageData, 'status' | 'source' | 'id'>) {
    try { pages[pages.findIndex(page => page.id === id)] = { ...calculate(), id, status: 'ready', source: 'import' }; }
    catch { /* An optional missing source leaves only this topic unavailable. */ }
  }
  const visitsSource = recapQueries.find(item => item.name === 'Shared visit intervals')!.sql;
  const terminal = '\nSELECT COUNT(*) AS intervals FROM visits;';
  if (!visitsSource.endsWith(terminal)) return pages;
  const visits = visitsSource.slice(0, -terminal.length);
  const entries = (rows: Record<string, SqlValue>[], numeric = false): NewFriendEntry[] => rows.map(row => ({
    userId: String(row.user_id), name: String(row.display_name || 'Unknown player'), seconds: numeric ? 0 : Number(row.value),
    ...(numeric ? { value: Number(row.value) } : {}),
    ...(row.cached_at ? { detail: `Cached ${String(row.cached_at).slice(0, 10)}` } : {}),
  }));
  // Merge shared intervals across repeated player-leave records before aggregating.
  const shared = `${visits}, overlaps AS (
    SELECT j.user_id,MAX(v.start_s,unixepoch(j.created_at,'subsec')-j.time/1000.0) AS start_s,
      MIN(v.end_s,unixepoch(j.created_at,'subsec')) AS end_s
    FROM gamelog_join_leave j JOIN "${account}_friend_log_current" f ON f.user_id=j.user_id
    JOIN visits v ON v.location=j.location AND unixepoch(j.created_at,'subsec')>v.start_s
      AND unixepoch(j.created_at,'subsec')-j.time/1000.0<v.end_s
    WHERE j.type='OnPlayerLeft' AND j.time>0 AND j.user_id<>:self_id
  ), prior AS (
    SELECT *,MAX(end_s) OVER (PARTITION BY user_id ORDER BY start_s,end_s
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_end FROM overlaps WHERE end_s>start_s
  ), grouped AS (
    SELECT *,SUM(CASE WHEN prior_end>=start_s THEN 0 ELSE 1 END)
      OVER (PARTITION BY user_id ORDER BY start_s,end_s ROWS UNBOUNDED PRECEDING) AS interval_group FROM prior
  ), merged AS (
    SELECT user_id,MIN(start_s) AS start_s,MAX(end_s) AS end_s FROM grouped GROUP BY user_id,interval_group
  ), totals AS (SELECT user_id,SUM(end_s-start_s) AS value FROM merged GROUP BY user_id)`;
  safe('time', () => {
    const rows = query(shared + ` SELECT COUNT(*) OVER() AS total,t.user_id,f.display_name,t.value FROM totals t
      JOIN "${account}_friend_log_current" f ON f.user_id=t.user_id ORDER BY value DESC,t.user_id LIMIT 10;`);
    return { total: Number(rows[0]?.total ?? 0), rankingStatus: 'ready', entries: entries(rows) };
  });
  safe('overlap', () => {
    // Pair each Online with its immediately following Offline. A later Online
    // replaces an incomplete interval; no duration is invented for an open tail.
    const presence = `${visits}, own_prior AS (
      SELECT start_s,end_s,MAX(end_s) OVER (ORDER BY start_s,end_s ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_end FROM visits
    ), own_grouped AS (
      SELECT *,SUM(CASE WHEN prior_end>=start_s THEN 0 ELSE 1 END) OVER (ORDER BY start_s,end_s ROWS UNBOUNDED PRECEDING) AS interval_group FROM own_prior
    ), own_sessions AS MATERIALIZED (
      SELECT MIN(start_s) AS start_s,MAX(end_s) AS end_s FROM own_grouped GROUP BY interval_group
    ), presence AS (
      SELECT p.user_id,p.type,unixepoch(p.created_at,'subsec') AS at_s,
        LEAD(p.type) OVER (PARTITION BY p.user_id ORDER BY p.created_at,p.id) AS next_type,
        LEAD(unixepoch(p.created_at,'subsec')) OVER (PARTITION BY p.user_id ORDER BY p.created_at,p.id) AS next_s
      FROM "${account}_feed_online_offline" p JOIN "${account}_friend_log_current" f ON f.user_id=p.user_id
      WHERE p.type IN ('Online','Offline') AND p.user_id<>:self_id
    ), online AS MATERIALIZED (SELECT * FROM presence WHERE type='Online' AND next_type='Offline' AND next_s>at_s AND next_s>unixepoch(:from_utc,'subsec') AND at_s<unixepoch(:to_utc,'subsec')),
    -- Sample cumulative own playtime at each online/offline endpoint instead
    -- of comparing every presence interval with every own session.
    play_events AS (
      SELECT start_s AS at_s,1 AS rate,-start_s AS adjustment,NULL AS user_id,0 AS sign FROM own_sessions
      UNION ALL SELECT end_s,-1,end_s,NULL,0 FROM own_sessions
      UNION ALL SELECT at_s,0,0,user_id,-1 FROM online
      UNION ALL SELECT next_s,0,0,user_id,1 FROM online
    ), play_samples AS (
      SELECT user_id,sign,
        at_s*SUM(rate) OVER (ORDER BY at_s ROWS UNBOUNDED PRECEDING)
        +SUM(adjustment) OVER (ORDER BY at_s ROWS UNBOUNDED PRECEDING) AS played_s
      FROM play_events
    ), totals AS (
      SELECT user_id,SUM(sign*played_s) AS value FROM play_samples WHERE user_id IS NOT NULL
      GROUP BY user_id HAVING value>0
    )`;
    const coverage = query(`SELECT COUNT(*) AS total,MIN(created_at) AS first,MAX(created_at) AS last FROM "${account}_feed_online_offline" WHERE type IN ('Online','Offline');`)[0]!;
    if (!Number(coverage.total)) throw new Error('No presence coverage');
    if (options.facts) options.facts.coverage = query(`SELECT user_id, MIN(created_at) AS first, MAX(created_at) AS last
      FROM "${account}_feed_online_offline" WHERE type IN ('Online','Offline') GROUP BY user_id`).map(row => ({
      userId: String(row.user_id ?? ''), first: row.first === null ? null : String(row.first), last: row.last === null ? null : String(row.last),
    }));
    const rows = query(presence + ` SELECT COUNT(*) OVER() AS total,(SELECT SUM(end_s-start_s) FROM own_sessions) AS own_seconds,t.user_id,f.display_name,t.value FROM totals t JOIN "${account}_friend_log_current" f ON f.user_id=t.user_id ORDER BY value DESC,t.user_id LIMIT 10;`);
    return { total: Number(rows[0]?.total ?? 0), ownSeconds: Number(rows[0]?.own_seconds ?? 0), rankingStatus: 'ready', entries: entries(rows),
      note: presenceCoverageNote(coverage.first === null ? null : String(coverage.first), coverage.last === null ? null : String(coverage.last)) };

  });
  safe('strangers', () => {

    const inspected = recapQueries.find(item => item.name === 'Inspect the users counted as strangers')!.sql;
    const rows = query(inspected.replace('encounters AS (', 'encounters AS MATERIALIZED (').replace('inferred_status AS (', 'inferred_status AS MATERIALIZED (').replace('stranger_encounters AS (', 'stranger_encounters AS MATERIALIZED (').replace('SELECT t.user_id,', 'SELECT COUNT(*) OVER() AS unique_strangers,t.user_id,').replace(/;\s*$/, ' LIMIT 10;'));
    return { total: Number(rows[0]?.unique_strangers ?? 0), rankingStatus: 'ready', entries: entries(rows.map(row => ({ ...row, value: row.distinct_instances })), true) };
  });
  safe('mutuals', () => {
    const joinedFriends = `FROM "${account}_friend_log_current" f
      JOIN "${account}_mutual_graph_meta" m ON m.friend_id=f.user_id
      JOIN "${account}_mutual_graph_links" l ON l.friend_id=f.user_id
      JOIN "${account}_friend_log_current" shared ON shared.user_id=l.mutual_id
      WHERE m.opted_out=0 AND m.last_fetched_at<>''
        AND shared.user_id<>f.user_id AND shared.user_id<>:self_id AND f.user_id<>:self_id`;
    const base = `WITH candidates AS (
      SELECT f.user_id,f.display_name,COUNT(DISTINCT shared.user_id) AS value,m.last_fetched_at AS cached_at
      ${joinedFriends} GROUP BY f.user_id,f.display_name,m.last_fetched_at
    )`;
    const meta = ` FROM "${account}_mutual_graph_meta" WHERE opted_out=0 AND last_fetched_at<>''`;
    const coverageIds = options.facts ? query('SELECT friend_id' + meta).map(row => String(row.friend_id ?? '')) : undefined;
    if (!(coverageIds?.length ?? Number(query('SELECT COUNT(*) AS total' + meta)[0]!.total))) throw new Error('No mutual graph coverage');
    const currentFriends = ' FROM "{{account}}_friend_log_current" WHERE user_id<>:self_id;';
    const friendIds = coverageIds ? query('SELECT DISTINCT user_id' + currentFriends).map(row => String(row.user_id)) : undefined;
    if (options.facts && coverageIds && friendIds) {
      const sharedByUser = new Map<string, Set<string>>();
      for (const row of query(`SELECT DISTINCT f.user_id, shared.user_id AS shared_id ${joinedFriends}`)) {
        const id = String(row.user_id);
        const shared = sharedByUser.get(id) ?? new Set<string>();
        shared.add(String(row.shared_id));
        sharedByUser.set(id, shared);
      }
      options.facts.mutuals = { coverageIds, friendIds, sharedByUser };
    }
    const rows = query(base + ' SELECT COUNT(*) OVER() AS total, candidates.* FROM candidates ORDER BY value DESC,user_id LIMIT 10;');
    const friendCount = friendIds?.length ?? Number(query('SELECT COUNT(DISTINCT user_id) AS total' + currentFriends)[0]!.total);
    return { total: Number(rows[0]?.total ?? 0), friendCount, rankingStatus: 'ready', entries: entries(rows, true) };
  });
  // Legacy notifications explicitly identify the receiver. V2 boops belong to
  // this account's received feed; no group/gift notifications are substituted.
  const notifications: Record<string, SqlValue>[] = [];
  let legacyAvailable = false, v2Available = false;
  try {
    notifications.push(...query(`SELECT id,type,sender_user_id AS user_id FROM "${account}_notifications"
      WHERE receiver_user_id=:self_id AND COALESCE(sender_user_id,'')<>:self_id
        AND type IN ('invite','requestInvite','boop') AND id IS NOT NULL AND id<>''
        AND unixepoch(created_at,'subsec')>=unixepoch(:from_utc,'subsec') AND unixepoch(created_at,'subsec')<unixepoch(:to_utc,'subsec');`));
    legacyAvailable = true;
  } catch { /* Optional legacy feed. */ }
  try {
    notifications.push(...query(`SELECT id,type,sender_user_id AS user_id FROM "${account}_notifications_v2"
      WHERE type='boop' AND COALESCE(sender_user_id,'')<>:self_id AND id IS NOT NULL AND id<>''
        AND unixepoch(created_at,'subsec')>=unixepoch(:from_utc,'subsec') AND unixepoch(created_at,'subsec')<unixepoch(:to_utc,'subsec');`));
    v2Available = true;
  } catch { /* Optional V2 feed. */ }
  const boopPictures: { id: string; url: string; userId?: string }[] = [];
  if (legacyAvailable || v2Available) {
    for (const [suffix, receiver] of [['notifications', 'AND receiver_user_id=:self_id'], ['notifications_v2', '']] as const) try {
      for (const row of query(`SELECT id,image_url,sender_user_id FROM "${account}_${suffix}"
        WHERE type='boop' ${receiver} AND COALESCE(sender_user_id,'')<>:self_id AND id IS NOT NULL AND id<>''
          AND image_url IS NOT NULL AND image_url<>''
          AND unixepoch(created_at,'subsec')>=unixepoch(:from_utc,'subsec') AND unixepoch(created_at,'subsec')<unixepoch(:to_utc,'subsec');`)) {
        boopPictures.push({ id: String(row.id), url: String(row.image_url), ...(row.sender_user_id ? { userId: String(row.sender_user_id) } : {}) });
      }
    } catch { /* Optional image fields never disable the boop counts. */ }
  }
  function applyNotifications(target: FriendsPageData[], excluded: ReadonlySet<string>) {
    for (const [id, type] of [['boops','boop'],['invites','invite'],['requests','requestInvite']] as const) {
      if (!(id === 'boops' ? legacyAvailable || v2Available : legacyAvailable)) continue;
      const unique = new Map<string, Record<string, SqlValue>>();
      for (const row of notifications) if (row.type === type && !excluded.has(String(row.user_id ?? ''))) {
        const previous = unique.get(String(row.id));
        if (!previous || !previous.user_id) unique.set(String(row.id), row);
      }
      const people = new Map<string, number>();
      for (const row of unique.values()) if (String(row.user_id ?? '').startsWith('usr_')) people.set(String(row.user_id), (people.get(String(row.user_id)) ?? 0) + 1);
      target[target.findIndex(page => page.id === id)] = {
        id, source: 'import', status: 'ready', total: unique.size, rankingStatus: 'ready',
        note: `From ${people.size.toLocaleString('en-US')} different ${people.size === 1 ? 'person' : 'people'} in the retained notifications.`,
        entries: [...people].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,options.all ? undefined : 10).map(([userId,value]) => ({ userId, value, seconds: 0, name: 'Unknown player' })),
      };
      if (id === 'boops') {
        const byNotification = new Map<string, { url: string; userId?: string }>();
        for (const {id: notificationId, ...picture} of boopPictures) {
          if (!excluded.has(picture.userId ?? '') && !byNotification.has(notificationId)) byNotification.set(notificationId, picture);
        }
        target.find(page => page.id === id)!.boopImages = [...byNotification.values()];
      }
    }
  }
  applyNotifications(pages, new Set());
  if (options.facts) options.facts.applyNotifications = applyNotifications;
  // Cache names and pictures independently of ranking scores and membership.
  const people = new Map<string, { name?: string; imageUrl?: string }>();
  function enrich(target: FriendsPageData[]) {
    const images=new Map<string,string>();
    try {
      const ids=[...new Set(target.flatMap(page=>page.entries.map(entry=>entry.userId)))].filter(id => !people.has(id));
      if(ids.length) {
        const bindings=Object.fromEntries(ids.map((id,index)=>[':image_person_'+index,id]));
        for(const row of query(`SELECT user_id,image_url FROM (
          SELECT user_id,COALESCE(NULLIF(current_avatar_thumbnail_image_url,''),NULLIF(current_avatar_image_url,'')) AS image_url,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC,id DESC) AS position
          FROM "${account}_feed_avatar" WHERE user_id IN (${Object.keys(bindings).join(',')})
            AND COALESCE(NULLIF(current_avatar_thumbnail_image_url,''),NULLIF(current_avatar_image_url,'')) IS NOT NULL
        ) WHERE position=1;`,bindings))images.set(String(row.user_id),String(row.image_url));
      }
    } catch { /* Optional saved pictures never disable the statistics. */ }

    for (const page of target) for (const entry of page.entries) {
      let person = people.get(entry.userId);
      if (!person) {
        person = {};
        for (const sql of [
          `SELECT display_name AS name FROM "${account}_friend_log_current" WHERE user_id=:person AND display_name<>'' LIMIT 1;`,
          `SELECT display_name AS name FROM "${account}_friend_log_history" WHERE user_id=:person AND display_name<>'' ORDER BY created_at DESC,id DESC LIMIT 1;`,
          `SELECT display_name AS name FROM gamelog_join_leave WHERE user_id=:person AND display_name<>'' ORDER BY created_at DESC,id DESC LIMIT 1;`,
        ]) try { const row = query(sql, { ':person': entry.userId })[0]; if (row?.name) { person.name = String(row.name); break; } } catch { /* Optional label source. */ }
        person.imageUrl=images.get(entry.userId);
        people.set(entry.userId, person);
      }
      if (person.name && page.id !== 'added') entry.name = person.name;
      if (person.imageUrl) entry.imageUrl = person.imageUrl;
    }
  }
  if (options.facts) options.facts.enrich = enrich;
  if (options.enrich !== false) enrich(pages.slice(1));
  return pages;
}
