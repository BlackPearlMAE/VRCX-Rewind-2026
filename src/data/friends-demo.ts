import type { FriendsPageData } from './friends-data';
import { filterFriendsDemo, type FriendsDemoSnapshot } from './friends-demo-filter';
import { publicFriendsDemo, publicDemoFriendIds } from './public-friends-demo';

// Both development and production use the same fictional public snapshot.
// Retained only for the startup contract; no private snapshot is discovered.
export const friendsDemoReady = Promise.resolve();
export function savedFriendsSnapshot(): FriendsDemoSnapshot { return structuredClone(publicFriendsDemo); }
export function savedFriendsDemo(excluded: readonly string[] = []): FriendsPageData[] {
  const hidden = new Set(excluded);
  const friendCount = publicDemoFriendIds.filter(id => !hidden.has(id)).length;
  return filterFriendsDemo(publicFriendsDemo, excluded).map(page =>
    page.id === 'mutuals' ? { ...page, friendCount } : page);
}
