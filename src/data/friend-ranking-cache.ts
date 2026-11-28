import type { Database } from 'sql.js';
import { calculateFriendsChapter, presenceCoverageNote, type FriendsChapterFacts } from './friends-chapter-query';
import { unavailableFriends, type FriendsPageData } from './friends-data';
import { calendarMidnight } from './timeline-calendar';
import type { FriendTimelinePerson } from './timeline-query';

const visibleCount = 10;
const reserveCount = 5;

/** Cache ranking scores for exact totals and prefetch display details for the first fifteen. */
export function prepareFriendRankings(db: Database, account: string, now: number, history?: readonly FriendTimelinePerson[]) {
  const facts: FriendsChapterFacts = {};
  const base = calculateFriendsChapter(db, account, now, { all: true, enrich: false, facts });
  const yearStart = calendarMidnight(2026, 0, 1, 'Europe/Berlin');
  const cutoff = Math.min(now, calendarMidnight(2027, 0, 1, 'Europe/Berlin'));
  const added = history?.filter(person => person.added !== null && person.added >= yearStart && person.added < cutoff);
  const limit = (pages: readonly FriendsPageData[], count: number) => pages.map(page => ({
    ...page, entries: page.entries.slice(0, count).map(entry => ({ ...entry })),
  }));
  facts.enrich?.(limit(base, visibleCount + reserveCount));

  return (excludedIds: readonly string[] = []) => {
    const excluded = new Set(excludedIds);
    const pages = base.map(page => {
      if (page.status !== 'ready' || !excluded.size) return page;
      const entries = page.entries.filter(entry => !excluded.has(entry.userId));
      switch (page.id) {
        case 'added':
          return { ...page, total: added?.filter(person => !excluded.has(person.userId)).length ?? page.total, entries };
        case 'time':
        case 'strangers':
          return { ...page, total: entries.length, entries };
        case 'overlap': {
          const coverage = facts.coverage?.filter(person => !excluded.has(person.userId));
          if (!coverage?.length) return { ...unavailableFriends(), id: 'overlap' as const };
          let first: string | null = null, last: string | null = null;
          for (const person of coverage) {
            if (person.first !== null && (first === null || person.first < first)) first = person.first;
            if (person.last !== null && (last === null || person.last > last)) last = person.last;
          }
          return { ...page, total: entries.length, ownSeconds: entries.length ? page.ownSeconds : 0, entries, note: presenceCoverageNote(first, last) };
        }
        case 'mutuals': {
          const mutuals = facts.mutuals;
          if (!mutuals?.coverageIds.some(id => !excluded.has(id))) return { ...unavailableFriends(), id: 'mutuals' as const };
          const ranked = entries.map(entry => {
            let value = 0;
            for (const id of mutuals.sharedByUser.get(entry.userId) ?? []) if (!excluded.has(id)) value++;
            return { ...entry, value };
          }).filter(entry => entry.value > 0).sort((a, b) => b.value - a.value || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
          return { ...page, total: ranked.length, entries: ranked, friendCount: mutuals.friendIds.filter(id => !excluded.has(id)).length };
        }
        default:
          return page;
      }
    });
    if (excluded.size) facts.applyNotifications?.(pages, excluded);
    const visible = limit(pages, visibleCount);
    facts.enrich?.(visible);
    return visible;
  };
}
