import { friendsDefinitions, type FriendsId } from './friends-definitions';
export interface NewFriendEntry {
  userId: string;
  name: string;
  seconds: number;
  imageUrl?: string;
  value?: number;
  detail?: string;
}
export interface FriendsPageData {
  id?: FriendsId;
  note?: string;
  boopImages?: { url: string; userId?: string }[];
  status: 'ready' | 'unavailable';
  total: number;
  ownSeconds?: number;
  friendCount?: number;
  rankingStatus: 'ready' | 'unavailable';
  entries: NewFriendEntry[];
  source: 'import' | 'synthetic-demo' | 'recorded-aggregate';
}
export function unavailableFriends(): FriendsPageData {
  return { status: 'unavailable', total: 0, rankingStatus: 'unavailable', entries: [], source: 'import' };
}
/** Illustrative people only; no private friend identities are bundled in the demo. */
export function friendsDemo(): FriendsPageData {
  return {
    status: 'ready', total: 47, rankingStatus: 'ready', source: 'synthetic-demo',
    entries: [['Moss', 126.4], ['Echo', 82.7], ['Nova', 59.2], ['Pixel', 34.8], ['Sky', 21.6], ['Fern', 18.2], ['Orbit', 14.5], ['Finch', 10.8], ['River', 7.4], ['Ember', 4.1]].map(([name, hours], index) => ({
      userId: `synthetic-friend-${index}`, name: String(name), seconds: Number(hours) * 3600,
    })),
  };
}

export function friendsChapterDemo(): FriendsPageData[] {
  const added = { ...friendsDemo(), id: 'added' as const };
  return friendsDefinitions.map(definition => definition.id === 'added' ? added : {
    ...friendsDemo(), id: definition.id, total: definition.id === 'strangers' ? 312 : definition.id === 'mutuals' ? 94 : definition.entryUnit === 'hours' ? 26 : 257,
    entries: friendsDemo().entries.map((entry, index) => ({ ...entry,
      ...(definition.entryUnit === 'count' ? { seconds: 0, value: Math.max(1, 35 - index * 3) } : {}),
      ...(definition.id === 'mutuals' ? { detail: 'Cached 2026-11-20' } : {}),
    })),
  });
}
