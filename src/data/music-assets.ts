/** Add future background tracks here so startup prepares every track for local playback. */
export const musicAssets = [
  { path: 'audio/qptMg0JWmFY.mp3', bytes: 5449580 },
  { path: 'audio/jVTsD4UPT-k.mp3', bytes: 5881581 },
  { path: 'audio/r_Q15eu03z8.mp3', bytes: 6793389 },
] as const;

const localMusic = new Map<string, Promise<string>>();

/** One complete download per track, shared by startup and both crossfade players. */
export function localMusicUrl(path: string): Promise<string> {
  let pending = localMusic.get(path);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { credentials: 'omit', signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error('Music asset unavailable');
      const blob = await response.blob();
      if (!blob.size) throw new Error('Music asset is empty');
      return URL.createObjectURL(blob);
    })();
    localMusic.set(path, pending);
  }
  return pending;
}

/** Report completed tracks, weighted by their expected size rather than a timer. */
export async function prepareMusicAssets(onProgress: (fraction: number) => void): Promise<boolean> {
  const total = musicAssets.reduce((sum, asset) => sum + asset.bytes, 0);
  let completed = 0;
  const results = await Promise.all(musicAssets.map(async asset => {
    let loaded = true;
    try { await localMusicUrl(asset.path); } catch { loaded = false; }
    completed += asset.bytes;
    onProgress(total > 0 ? completed / total : 1);
    return loaded;
  }));
  return results.every(Boolean);
}
