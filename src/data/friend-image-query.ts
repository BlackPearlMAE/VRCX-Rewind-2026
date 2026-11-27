import type { Database } from 'sql.js';
import { accountPrefixes } from './database-accounts';
import { recapQueries } from './recap-sql-catalog';
import { calendarMidnight } from './timeline-calendar';

export interface FriendImageEntry { userId: string; name: string; seconds: number; imageUrl?: string; imageDate?: string }
export interface FriendImageResult { ok: boolean; entries: FriendImageEntry[]; message: string }

/** Reuse the existing corrected shared-time ranking; all image URLs stay local. */
export function calculateFriendImages(db: Database, account: string): FriendImageResult {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const raw = account.slice(3);
  const self = `usr_${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
  const sql = recapQueries.find(query => query.name === 'Top 10 friends by time together')!.sql
    .replace(/LIMIT 10;?\s*$/, '').replaceAll('{{account}}', account);
  const statement = db.prepare(sql);
  const entries: FriendImageEntry[] = [];
  try {
    statement.bind({ ':self_id': self, ':from_utc': new Date(calendarMidnight(2026, 0, 1, 'Europe/Berlin')).toISOString(), ':to_utc': new Date(Math.min(Date.now(), calendarMidnight(2027, 0, 1, 'Europe/Berlin'))).toISOString() });
    while (statement.step()) {
      const row = statement.getAsObject();
      entries.push({ userId: String(row.user_id), name: String(row.display_name || 'Unknown friend'), seconds: Number(row.shared_seconds) });
    }
  } finally { statement.free(); }
  // Choose the latest retained event with a usable current image, not the previous avatar.
  try {
    const images = db.prepare(`SELECT user_id,created_at,image_url FROM (
      SELECT user_id,created_at,COALESCE(NULLIF(current_avatar_thumbnail_image_url,''),NULLIF(current_avatar_image_url,'')) AS image_url,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC,id DESC) AS position
      FROM "${account}_feed_avatar"
      WHERE COALESCE(NULLIF(current_avatar_thumbnail_image_url,''),NULLIF(current_avatar_image_url,'')) IS NOT NULL
    ) WHERE position=1`);
    const byId = new Map(entries.map(entry => [entry.userId, entry]));
    try {
      while (images.step()) {
        const row = images.getAsObject();
        const entry = byId.get(String(row.user_id));
        if (entry) { entry.imageUrl = String(row.image_url); entry.imageDate = String(row.created_at); }
      }
    } finally { images.free(); }
  } catch { /* Missing avatar history leaves red missing-image placeholders. */ }
  return { ok: true, entries, message: entries.length ? '' : 'No recorded time with current friends was found for 2026.' };
}
