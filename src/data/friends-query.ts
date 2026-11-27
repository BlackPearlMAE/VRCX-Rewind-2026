import type { Database, SqlValue } from 'sql.js';
import { accountPrefixes } from './database-accounts';
import { recapQueries } from './recap-sql-catalog';
import { calendarMidnight } from './timeline-calendar';
import { unavailableFriends, type FriendsPageData } from './friends-data';

/** Fixed read-only queries; friendship eligibility uses all retained transitions. */
export function calculateFriends(db: Database, account: string, now = Date.now(), options: { all?: boolean; enrich?: boolean } = {}): FriendsPageData {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const raw = account.slice(3);
  const self = `usr_${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  const params = {
    ':self_id': self,
    ':from_utc': new Date(calendarMidnight(2026, 0, 1, 'Europe/Berlin')).toISOString(),
    ':to_utc': new Date(Math.min(now, calendarMidnight(2027, 0, 1, 'Europe/Berlin'))).toISOString(),
  };
  function query(sql: string, extra: Record<string, string> = {}): Record<string, SqlValue>[] {
    if (options.all) sql = sql.replace(/ LIMIT 10;\s*$/, ';');
    const statement = db.prepare(sql);
    try {
      statement.bind(Object.fromEntries(Object.entries({ ...params, ...extra }).filter(([key]) => sql.includes(key))));
      const rows: Record<string, SqlValue>[] = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally { statement.free(); }
  }
  const history = `friend_transitions AS (
    SELECT user_id, type, unixepoch(created_at,'subsec') AS at_s,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at,id) AS position,
      LEAD(unixepoch(created_at,'subsec')) OVER (PARTITION BY user_id ORDER BY created_at,id) AS next_s
    FROM "${account}_friend_log_history"
    WHERE type IN ('Friend','Unfriend') AND user_id GLOB 'usr_*' AND user_id<>:self_id
  ), new_friends AS (
    SELECT user_id,at_s FROM friend_transitions WHERE position=1 AND type='Friend'
    AND at_s>=unixepoch(:from_utc,'subsec') AND at_s<unixepoch(:to_utc,'subsec')
  )`;
  const result = unavailableFriends();
  try {
    result.total = Number(query(`WITH ${history} SELECT COUNT(*) AS total FROM new_friends;`)[0]!.total);
    result.status = 'ready';
  } catch { return result; }
  try {
    const source = recapQueries.find(item => item.name === 'Shared visit intervals')!.sql;
    const terminal = '\nSELECT COUNT(*) AS intervals FROM visits;';
    if (!source.endsWith(terminal)) return result;
    const visits = source.slice(0, -terminal.length);
    // Intersect corrected own visits, recorded peer stays, and active friendship windows.
    // Merge repeated/overlapping leave records before summing, including across visits.
    const rows = query(`${visits}, ${history}, overlaps AS (
      SELECT n.user_id, MAX(v.start_s,unixepoch(j.created_at,'subsec')-j.time/1000.0,f.at_s) AS start_s,
        MIN(v.end_s,unixepoch(j.created_at,'subsec'),COALESCE(f.next_s,unixepoch(:to_utc,'subsec'))) AS end_s
      FROM new_friends n JOIN friend_transitions f ON f.user_id=n.user_id AND f.type='Friend'
      JOIN gamelog_join_leave j ON j.user_id=n.user_id AND j.type='OnPlayerLeft' AND j.time>0
      JOIN visits v ON v.location=j.location
        AND unixepoch(j.created_at,'subsec')>v.start_s
        AND unixepoch(j.created_at,'subsec')-j.time/1000.0<v.end_s
        AND f.at_s<v.end_s AND COALESCE(f.next_s,unixepoch(:to_utc,'subsec'))>v.start_s
    ), prior AS (
      SELECT *,MAX(end_s) OVER (PARTITION BY user_id ORDER BY start_s,end_s
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_end FROM overlaps WHERE end_s>start_s
    ), grouped AS (
      SELECT *,SUM(CASE WHEN prior_end>=start_s THEN 0 ELSE 1 END)
        OVER (PARTITION BY user_id ORDER BY start_s,end_s ROWS UNBOUNDED PRECEDING) AS interval_group FROM prior
    ), merged AS (
      SELECT user_id,MIN(start_s) AS start_s,MAX(end_s) AS end_s FROM grouped GROUP BY user_id,interval_group
    )
    SELECT i.user_id,COALESCE(NULLIF(f.display_name,''),
      (SELECT NULLIF(j.display_name,'') FROM gamelog_join_leave j WHERE j.user_id=i.user_id ORDER BY j.created_at DESC,j.id DESC LIMIT 1),
      'Unknown friend') AS name,SUM(i.end_s-i.start_s) AS seconds
    FROM merged i LEFT JOIN "${account}_friend_log_current" f ON f.user_id=i.user_id
    GROUP BY i.user_id ORDER BY seconds DESC,i.user_id LIMIT 10;`);
    result.entries = rows.map(row => ({ userId: String(row.user_id), name: String(row.name), seconds: Number(row.seconds) }));
    result.rankingStatus = 'ready';
    // Missing avatar history affects pictures only, never the count or ranking.
    for (const entry of options.enrich === false ? [] : result.entries) {
      try {
        const image = query(`SELECT COALESCE(NULLIF(current_avatar_thumbnail_image_url,''),NULLIF(current_avatar_image_url,'')) AS image_url
          FROM "${account}_feed_avatar" WHERE user_id=:friend_id
          AND COALESCE(NULLIF(current_avatar_thumbnail_image_url,''),NULLIF(current_avatar_image_url,'')) IS NOT NULL
          ORDER BY created_at DESC,id DESC LIMIT 1;`, { ':friend_id': entry.userId })[0];
        if (image?.image_url) entry.imageUrl = String(image.image_url);
      } catch { /* Optional saved avatar fields. */ }
    }
  } catch { /* Keep the independently available new-friend count. */ }
  return result;
}
