import type { Database } from 'sql.js';
import { accountPrefixes } from './database-accounts';
export interface OwnAvatarPicture { avatarId: string; name: string; url: string }
/** Recent worn avatars, not avatars authored by the user. Only picture candidates leave the worker. */
export function ownAvatarPictures(db: Database, account: string): OwnAvatarPicture[] {
  if (!accountPrefixes(db).includes(account)) return [];
  const statement = db.prepare(`SELECT h.avatar_id, COALESCE(NULLIF(a.name,''),'Saved avatar') AS name,
    COALESCE(NULLIF(a.thumbnail_image_url,''),NULLIF(a.image_url,'')) AS url
    FROM "${account}_avatar_history" h JOIN cache_avatar a ON a.id=h.avatar_id
    WHERE COALESCE(NULLIF(a.thumbnail_image_url,''),NULLIF(a.image_url,'')) IS NOT NULL
    GROUP BY h.avatar_id ORDER BY MAX(h.created_at) DESC,h.avatar_id LIMIT 40;`);
  try {
    const result: OwnAvatarPicture[] = [];
    while (statement.step()) { const row = statement.getAsObject(); result.push({ avatarId: String(row.avatar_id), name: String(row.name), url: String(row.url) }); }
    return result;
  } finally { statement.free(); }
}

export interface OwnShareProfile { displayName?: string; pictures: OwnAvatarPicture[] }
/** Select only the account owner's recorded display name; never read credentials/configuration. */
export function ownShareProfile(db: Database, account: string, includePictures = true): OwnShareProfile {
  const result: OwnShareProfile = { pictures: [] };
  if (!accountPrefixes(db).includes(account)) return result;
  const raw=account.slice(3);
  const selfId=`usr_${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
  try {
    const statement=db.prepare(`SELECT display_name FROM gamelog_join_leave WHERE user_id=:self
      AND NULLIF(TRIM(display_name),'') IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1;`);
    try { statement.bind({':self':selfId}); if(statement.step())result.displayName=String(statement.get()[0]); }
    finally { statement.free(); }
  } catch { /* Some histories do not retain the owner's name. Manual entry remains available. */ }
  if (includePictures) try { result.pictures=ownAvatarPictures(db,account); } catch { /* Optional avatar history/cache. */ }
  return result;
}
