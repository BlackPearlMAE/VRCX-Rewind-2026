import type { Database, SqlValue } from 'sql.js';
import { recapQueries } from './recap-sql-catalog';
import { accountPrefixes } from './database-accounts';
import { calendarMidnight } from './timeline-calendar';
import { unavailableWorlds, type WorldEntry, type WorldsId, type WorldsPageData } from './worlds-data';

/** Fixed activity-only queries. Only aggregates and world labels leave the worker. */
export function calculateWorlds(db: Database, account: string, now = Date.now()): WorldsPageData[] {
  if (!accountPrefixes(db).includes(account)) throw new Error('Choose an account');
  const uuid = account.slice(3);
  const selfId = `usr_${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
  const zone = 'Europe/Berlin', year = 2026;
  const from = calendarMidnight(year, 0, 1, zone);
  const cutoff = Math.min(now, calendarMidnight(year + 1, 0, 1, zone));
  const params: Record<string, string | number> = { ':self_id': selfId, ':from_utc': new Date(from).toISOString(), ':to_utc': new Date(cutoff).toISOString() };
  function query(sql: string): Record<string, SqlValue>[] {
    const statement = db.prepare(sql);
    try {
      statement.bind(Object.fromEntries(Object.entries(params).filter(([key]) => sql.includes(key))));
      const rows: Record<string, SqlValue>[] = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally { statement.free(); }
  }
  const result = unavailableWorlds();
  function safe(id: WorldsId, calculate: () => Omit<WorldsPageData, 'id' | 'status'>) {
    try { result[result.findIndex(page => page.id === id)] = { ...calculate(), id, status: 'ready' }; }
    catch { /* An absent optional table leaves this topic unavailable, never falsely zero. */ }
  }
  const name = "COALESCE(NULLIF(w.name,''),MAX(NULLIF(v.world_name,'')),v.world_id)";
  const validVisits = `SELECT world_id, world_name, location, unixepoch(created_at,'subsec') AS at_s
    FROM gamelog_location WHERE location GLOB 'wrld_*:*' AND world_id GLOB 'wrld_*'
    AND unixepoch(created_at,'subsec')>=unixepoch(:from_utc,'subsec') AND unixepoch(created_at,'subsec')<unixepoch(:to_utc,'subsec')`;
  const entries = (rows: Record<string, SqlValue>[]): WorldEntry[] => rows.map(row => ({ worldId: String(row.world_id), name: String(row.world_name), value: Number(row.value) }));
  const terminal = '\nSELECT COUNT(*) AS intervals FROM visits;';
  const shared = recapQueries.find(query => query.name === 'Shared visit intervals')!.sql;
  if (!shared.endsWith(terminal)) return result;
  const visits = shared.slice(0, -terminal.length);
  // Discovery is measured against the full retained history, not just this year's rows.
  const discoveries = `WITH first_visits AS (
    SELECT world_id, MAX(NULLIF(world_name,'')) AS world_name, MIN(unixepoch(created_at,'subsec')) AS at_s
    FROM gamelog_location WHERE location GLOB 'wrld_*:*' AND world_id GLOB 'wrld_*' GROUP BY world_id
  ), discoveries AS (SELECT * FROM first_visits WHERE at_s>=unixepoch(:from_utc,'subsec') AND at_s<unixepoch(:to_utc,'subsec'))`;
  safe('discoveries', () => {
    const total = Number(query(discoveries + ' SELECT COUNT(*) AS total FROM discoveries;')[0]!.total);
    // Rank only worlds first discovered in this recap. Include the first visit,
    // clamp corrected time at discovery and the recap cutoff, and keep ties stable.
    const rows = query(visits + ', ' + discoveries.slice('WITH '.length) + `
      SELECT d.world_id,COALESCE(NULLIF(w.name,''),NULLIF(d.world_name,''),d.world_id) AS world_name,
        COALESCE(SUM(MAX(0,v.end_s-MAX(v.start_s,d.at_s))),0)/3600.0 AS value
      FROM discoveries d LEFT JOIN visits v ON v.world_id=d.world_id AND v.end_s>d.at_s
      LEFT JOIN cache_world w ON w.id=d.world_id
      GROUP BY d.world_id ORDER BY value DESC,d.world_id LIMIT 5;`);
    return { total, entries: entries(rows), detail: `Top ${rows.length} new worlds by hours since discovery` };
  });
  safe('visits', () => {
    const base = `WITH visits AS (${validVisits})`;
    const rows = query(base + ` SELECT v.world_id,${name} AS world_name,COUNT(*) AS value FROM visits v LEFT JOIN cache_world w ON w.id=v.world_id GROUP BY v.world_id ORDER BY value DESC,v.world_id LIMIT 10;`);
    const counts=query(base + ' SELECT COUNT(*) AS total,COUNT(DISTINCT world_id) AS unique_worlds FROM visits;')[0]!;
    const total=Number(counts.total),uniqueWorlds=Number(counts.unique_worlds);
    return { total, uniqueWorlds, entries: entries(rows), detail: 'Ranked by visits' };
  });
  safe('time', () => {
    const rows = query(visits + ` SELECT v.world_id,${name} AS world_name,SUM(v.end_s-v.start_s)/3600.0 AS value FROM visits v LEFT JOIN cache_world w ON w.id=v.world_id WHERE v.world_id GLOB 'wrld_*' GROUP BY v.world_id ORDER BY value DESC,v.world_id LIMIT 10;`);
    const total = Number(query(visits + " SELECT COALESCE(SUM(end_s-start_s),0)/3600.0 AS total FROM visits WHERE world_id GLOB 'wrld_*';")[0]!.total);
    return { total, entries: entries(rows), detail: 'Ranked by estimated time' };
  });
  safe('owned', () => {
    // Exact ownership tag including parentheses; first retained sighting of each distinct location.
    const owned = `WITH first_instances AS (
      SELECT location,world_id,MAX(NULLIF(world_name,'')) AS world_name,MIN(unixepoch(created_at,'subsec')) AS at_s,
      CASE WHEN instr(location,'~friends('||:self_id||')')>0 THEN 'Friends'
           WHEN instr(location,'~hidden('||:self_id||')')>0 THEN 'Friends+'
           WHEN instr(location,'~private('||:self_id||')')>0 AND instr(location,'~canRequestInvite')>0 THEN 'Invite+'
           WHEN instr(location,'~private('||:self_id||')')>0 THEN 'Invite' END AS access
      FROM gamelog_location WHERE location GLOB 'wrld_*:*' AND world_id GLOB 'wrld_*' GROUP BY location,world_id
    ), owned AS (SELECT * FROM first_instances WHERE access IS NOT NULL AND at_s>=unixepoch(:from_utc,'subsec') AND at_s<unixepoch(:to_utc,'subsec'))`;
    const breakdownRows = query(owned + ' SELECT access,COUNT(*) AS value FROM owned GROUP BY access;');
    const breakdown = ['Friends', 'Friends+', 'Invite', 'Invite+'].map(label => ({ label, value: Number(breakdownRows.find(row => row.access === label)?.value ?? 0) }));
    const rows = query(owned + ` SELECT v.world_id,${name} AS world_name,COUNT(*) AS value FROM owned v LEFT JOIN cache_world w ON w.id=v.world_id GROUP BY v.world_id ORDER BY value DESC,v.world_id LIMIT 5;`);
    return { total: breakdown.reduce((sum, item) => sum + item.value, 0), entries: entries(rows), breakdown, detail: 'Dated by first recorded visit, not confirmed creation.' };
  });
  // Optional cached artwork also covers worlds absent from the bundled lookup.
  try {
    const statement=db.prepare("SELECT COALESCE(NULLIF(thumbnail_image_url,''),NULLIF(image_url,'')) FROM cache_world WHERE id=:world LIMIT 1;");
    try {
      const pictures=new Map<string,string | undefined>();
      for(const page of result)for(const entry of page.entries) {
        if(!pictures.has(entry.worldId)) {
          statement.bind({':world':entry.worldId});
          const value=statement.step() ? statement.get()[0] : undefined;
          pictures.set(entry.worldId,typeof value==='string' ? value : undefined);statement.reset();
        }
        entry.imageUrl=pictures.get(entry.worldId);
      }
    } finally { statement.free(); }
  } catch { /* Older caches still use the bundled lookup. */ }
  return result;
}
