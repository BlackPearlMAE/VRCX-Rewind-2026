import { friendsChapterDemo, type FriendsPageData } from './friends-data';
import type { RecordPageData } from './record-pages';
import { monthlyRecord } from './record-pages';

export interface FriendsDemoSnapshot {
  pages: FriendsPageData[];
  addedMembers: { userId: string; at: string }[];
  mutualEdges: { candidateId: string; friendId: string }[];
  generatedAt?: string;
}

export function syntheticFriendsSnapshot(): FriendsDemoSnapshot {
  const pages = friendsChapterDemo();
  const addedMembers = Array.from({ length: 47 }, (_, index) => ({ userId: `synthetic-friend-${index}`, at: `2026-${String(index % 10 + 1).padStart(2, '0')}-15T12:00:00.000Z` }));
  for (const page of pages) {
    const count = page.id === 'added' ? 47 : ['boops','invites','requests'].includes(page.id ?? '') ? 20 : page.total;
    const last = page.entries.at(-1)!;
    for (let index = page.entries.length; index < count; index++) page.entries.push({
      userId: `synthetic-friend-${index}`, name: `Demo person ${index + 1}`,
      seconds: last.value === undefined ? Math.max(60, last.seconds / (index - 8)) : 0,
      ...(last.value === undefined ? {} : { value: ['boops','invites','requests'].includes(page.id ?? '') ? 2 : 1 }),
    });
  }
  const mutualEdges = pages.find(page => page.id === 'mutuals')!.entries.flatMap(entry =>
    Array.from({ length: entry.value ?? 0 }, (_, index) => ({ candidateId: entry.userId, friendId: `synthetic-support-${index}` })));
  return { pages, addedMembers, mutualEdges };
}

/** Reaggregate the complete saved person metrics; never just hide a top-ten row. */
export function filterFriendsDemo(snapshot: FriendsDemoSnapshot, excludedIds: readonly string[]): FriendsPageData[] {
  const excluded = new Set(excludedIds);
  return snapshot.pages.map(base => {
    const page = structuredClone(base);
    const all = base.entries;
    page.boopImages = base.boopImages?.filter(image => !image.userId || !excluded.has(image.userId));
    page.entries = all.filter(entry => !excluded.has(entry.userId));
    if (base.id === 'added') page.total = snapshot.addedMembers.filter(person => !excluded.has(person.userId)).length;
    else if (base.id === 'mutuals') {
      const supports = new Map<string, Set<string>>();
      for (const edge of snapshot.mutualEdges) if (!excluded.has(edge.candidateId) && !excluded.has(edge.friendId)) {
        let friends = supports.get(edge.candidateId);
        if (!friends) { friends = new Set(); supports.set(edge.candidateId, friends); }
        friends.add(edge.friendId);
      }
      page.entries = page.entries.filter(entry => supports.has(entry.userId)).map(entry => ({ ...entry, value: supports.get(entry.userId)!.size }));
      page.total = page.entries.length;
    } else if (['boops','invites','requests'].includes(base.id ?? '')) {
      page.total = Math.max(0, base.total - all.filter(entry => excluded.has(entry.userId)).reduce((sum, entry) => sum + (entry.value ?? 0), 0));
      page.note = `From ${page.entries.length.toLocaleString('en-US')} different ${page.entries.length === 1 ? 'person' : 'people'} in the retained notifications.`;
    } else if (base.status === 'ready') page.total = page.entries.length;
    page.entries.sort((a,b) => (b.value ?? b.seconds) - (a.value ?? a.seconds) || a.userId.localeCompare(b.userId));
    page.entries = page.entries.slice(0, 10);
    return page;
  });
}

export function filterDemoFriendRecord(records: readonly RecordPageData[], snapshot: FriendsDemoSnapshot, excludedIds: readonly string[]): RecordPageData[] {
  const excluded = new Set(excludedIds);
  const members = snapshot.addedMembers.filter(person => !excluded.has(person.userId));
  const month = new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: 'Europe/Berlin' });
  return structuredClone(records).map(record => {
    if (record.id !== 'friends' || !record.timeline) return record;
    const timeline = record.timeline;
    timeline.months = timeline.months.map((entry, index) => entry.value === null ? entry : {
      ...entry, value: members.filter(person => Number(month.format(new Date(person.at))) - 1 === index).length,
    });
    timeline.weeks = timeline.weeks?.map(week => ({ ...week, value: week.value === null ? null : members.filter(person => Date.parse(person.at) >= Date.parse(week.start) && Date.parse(person.at) < Date.parse(week.end)).length }));
    return monthlyRecord('friends', timeline);
  });
}
