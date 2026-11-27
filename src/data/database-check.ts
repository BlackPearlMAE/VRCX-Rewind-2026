import DatabaseWorker from './database-check.worker?worker&inline';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { OwnShareProfile } from './own-avatar-query';
import type { FriendsPageData } from './friends-data';
import { unavailableFriendsChapter } from './friends-chapter-query';
import { unavailableWorlds, type WorldsPageData } from './worlds-data';
import type { FriendImageResult } from './friend-image-query';
import { unavailableRecords, type RecordPageData } from './record-pages';
import type { TimelineLoadResult, TimelineMetric } from './timeline-query';
export interface DatabaseCheck {
  ok: boolean;
  message: string;
  databaseVersion?: number;
  profile?: string;
  accounts?: string[];
}

// Keep only application assets here. Fresh workers can start after disconnection
// without retaining any imported database or relying on the browser HTTP cache.
let engineBytes: Promise<ArrayBuffer> | undefined;
function preloadEngine(): Promise<ArrayBuffer> {
  return engineBytes ??= fetch(wasmUrl, { credentials: 'omit', signal: AbortSignal.timeout(15000) }).then(async response => {
    if (!response.ok) throw new Error('Local database engine unavailable');
    return response.arrayBuffer();
  });
}

/** Preload the locally bundled checker and WASM before any file is selected. */
export function createDatabaseChecker() {
  const worker = new DatabaseWorker();
  let stopped = false;
  let sequence = 0;
  let failure = '';
  const shareProfileRequests = new Map<number, (profile: OwnShareProfile) => void>();
  const friendImageRequests = new Map<number, (result: FriendImageResult) => void>();
  const friendsRequests = new Map<number, (friends: FriendsPageData[]) => void>();
  const worldsRequests = new Map<number, (worlds: WorldsPageData[]) => void>();
  const recordRequests = new Map<number, (records: RecordPageData[]) => void>();
  const timelineRequests = new Map<number, (result: TimelineLoadResult) => void>();
  const pending = new Map<number, { resolve: (value: DatabaseCheck) => void; timer: ReturnType<typeof setTimeout> }>();
  let finishStartup = () => {};
  let startupTimer: ReturnType<typeof setTimeout>;
  const ready = new Promise<void>(resolve => {
    finishStartup = resolve;
    startupTimer = setTimeout(() => { failure = 'The local database checker could not load. Reload the page and try again.'; worker.terminate(); resolve(); }, 15000);
    worker.addEventListener('message', event => {
      const result = event.data;
      if (result.type === 'ready') {
        clearTimeout(startupTimer);
        if (!result.ok) failure = 'The local database checker could not start. Reload the page and try again.';
        resolve();
        return;
      }
      if (result.type === 'share-profile') { shareProfileRequests.get(result.id)?.(result.profile); shareProfileRequests.delete(result.id); return; }
      if (result.type === 'friend-images') { friendImageRequests.get(result.id)?.(result.result); friendImageRequests.delete(result.id); return; }
      if (result.type === 'friends') { friendsRequests.get(result.id)?.(result.friends); friendsRequests.delete(result.id); return; }
      if (result.type === 'worlds') { worldsRequests.get(result.id)?.(result.worlds); worldsRequests.delete(result.id); return; }
      if (result.type === 'records') { recordRequests.get(result.id)?.(result.records); recordRequests.delete(result.id); return; }
      if (result.type === 'timeline') { timelineRequests.get(result.id)?.(result.result); timelineRequests.delete(result.id); return; }
      const request = pending.get(result.id);
      if (request) { clearTimeout(request.timer); pending.delete(result.id); request.resolve(result.result); }
    });
    worker.addEventListener('error', event => {
      event.preventDefault();
      clearTimeout(startupTimer);
      failure = 'The local database checker stopped. Reload the page and try again.';
      resolve();
      for (const request of pending.values()) { clearTimeout(request.timer); request.resolve({ ok: false, message: failure }); }
      pending.clear();
      for (const resolveTimeline of timelineRequests.values()) resolveTimeline({ ok: false, message: failure });
      timelineRequests.clear();
      for (const resolveRecords of recordRequests.values()) resolveRecords(unavailableRecords(failure));
      recordRequests.clear();
      for (const resolveWorlds of worldsRequests.values()) resolveWorlds(unavailableWorlds());
      worldsRequests.clear();
      for (const resolveFriends of friendsRequests.values()) resolveFriends(unavailableFriendsChapter());
      friendsRequests.clear();
      for (const resolve of friendImageRequests.values()) resolve({ ok: false, entries: [], message: failure });
      friendImageRequests.clear();
      for (const resolve of shareProfileRequests.values()) resolve({ pictures: [] });
      shareProfileRequests.clear();
    });
  });
  void preloadEngine().then(wasm => {
    if (!stopped && !failure) worker.postMessage({ type: 'initialize', wasm });
  }, () => {
    if (!stopped && !failure) worker.postMessage({ type: 'initialize' });
  });
  return {
    async ready(): Promise<void> {
      await ready;
      if (stopped || failure) throw new Error(failure || 'Database selection cancelled.');
    },
    stop() {
      stopped = true; failure = 'Database selection cancelled.';
      clearTimeout(startupTimer); finishStartup();
      worker.terminate();
      for (const request of pending.values()) { clearTimeout(request.timer); request.resolve({ ok: false, message: failure }); }
      pending.clear();
      for (const resolveTimeline of timelineRequests.values()) resolveTimeline({ ok: false, message: failure });
      timelineRequests.clear();
      for (const resolveRecords of recordRequests.values()) resolveRecords(unavailableRecords(failure));
      recordRequests.clear();
      for (const resolveWorlds of worldsRequests.values()) resolveWorlds(unavailableWorlds());
      worldsRequests.clear();
      for (const resolveFriends of friendsRequests.values()) resolveFriends(unavailableFriendsChapter());
      friendsRequests.clear();
      for (const resolve of friendImageRequests.values()) resolve({ ok: false, entries: [], message: failure });
      friendImageRequests.clear();
      for (const resolve of shareProfileRequests.values()) resolve({ pictures: [] });
      shareProfileRequests.clear();
    },
    async loadShareProfile(account: string, includePictures = true): Promise<OwnShareProfile> {
      await ready;
      if (stopped || failure) return { pictures: [] };
      const id = ++sequence;
      return new Promise(resolve => { shareProfileRequests.set(id, resolve); worker.postMessage({ type: 'share-profile', id, account, includePictures }); });
    },
    async loadFriendImages(account: string): Promise<FriendImageResult> {
      await ready;
      if (stopped || failure) return { ok: false, entries: [], message: failure || 'Database selection cancelled.' };
      const id = ++sequence;
      return new Promise(resolve => { friendImageRequests.set(id, resolve); worker.postMessage({ type: 'friend-images', id, account }); });
    },
    async loadFriends(account: string, excluded: string[] = []): Promise<FriendsPageData[]> {
      await ready;
      if (stopped || failure) return unavailableFriendsChapter();
      const id = ++sequence;
      return new Promise(resolve => { friendsRequests.set(id, resolve); worker.postMessage({ type: 'friends', id, account, excluded }); });
    },
    async loadWorlds(account: string): Promise<WorldsPageData[]> {
      await ready;
      if (stopped || failure) return unavailableWorlds();
      const id = ++sequence;
      return new Promise(resolve => { worldsRequests.set(id, resolve); worker.postMessage({ type: 'worlds', id, account }); });
    },
    async loadRecords(account: string, excluded: string[] = []): Promise<RecordPageData[]> {
      await ready;
      if (stopped || failure) return unavailableRecords(failure || 'Database selection cancelled.');
      const id = ++sequence;
      return new Promise(resolve => { recordRequests.set(id, resolve); worker.postMessage({ type: 'records', id, account, excluded }); });
    },
    async loadTimeline(account: string, metric: TimelineMetric = 'hours'): Promise<TimelineLoadResult> {
      await ready;
      if (stopped || failure) return { ok: false, message: failure || 'Database selection cancelled.' };
      const id = ++sequence;
      return new Promise(resolve => { timelineRequests.set(id, resolve); worker.postMessage({ type: 'timeline', id, account, metric }); });
    },
    async check(file: File): Promise<DatabaseCheck> {
      await ready;
      if (failure) return { ok: false, message: failure };
      const id = ++sequence;
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          worker.terminate();
          failure = 'The database check did not finish. Reload the page and try again.';
          for (const request of pending.values()) { clearTimeout(request.timer); request.resolve({ ok: false, message: failure }); }
          pending.clear();
      for (const resolveTimeline of timelineRequests.values()) resolveTimeline({ ok: false, message: failure });
      timelineRequests.clear();
      for (const resolveRecords of recordRequests.values()) resolveRecords(unavailableRecords(failure));
      recordRequests.clear();
      for (const resolveWorlds of worldsRequests.values()) resolveWorlds(unavailableWorlds());
      worldsRequests.clear();
      for (const resolveFriends of friendsRequests.values()) resolveFriends(unavailableFriendsChapter());
      friendsRequests.clear();
      for (const resolve of friendImageRequests.values()) resolve({ ok: false, entries: [], message: failure });
      friendImageRequests.clear();
      for (const resolve of shareProfileRequests.values()) resolve({ pictures: [] });
      shareProfileRequests.clear();
        }, 120000);
        pending.set(id, { resolve, timer });
        worker.postMessage({ id, file });
      });
    },
  };
}
