/** VWI1: 8-byte header, then 16-byte world UUID + 16-byte file UUID + uint32 version. */
let index: Promise<Map<string, string>> | undefined;
function uuidAt(bytes: Uint8Array, offset: number): string {
  const hex = Array.from(bytes.subarray(offset, offset + 16), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function bundledWorldCatalog(): Promise<ReadonlyMap<string, string>> {
  // This fetches the static lookup from our own site, never world metadata from VRChat.
  index ??= (async () => {
    const result = new Map<string, string>();
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/world-thumbnails.bin`, { credentials: 'omit', signal: AbortSignal.timeout(120000) });
      if (!response.ok) return result;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 8 || buffer.byteLength > 8 + 36 * 100000) return result;
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);
      if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'VWI1') return result;
      const count = view.getUint32(4, true);
      if (buffer.byteLength !== 8 + count * 36) return result;
      for (let row = 0; row < count; row++) {
        const offset = 8 + row * 36;
        result.set(`wrld_${uuidAt(bytes, offset)}`, `https://api.vrchat.cloud/api/1/image/file_${uuidAt(bytes, offset + 16)}/${view.getUint32(offset + 32, true)}/256`);
      }
    } catch { /* Missing index leaves the existing image fallback. */ }
    return result;
  })();
  return index;
}

export async function bundledWorldThumbnail(worldId: string): Promise<string | undefined> {
  return (await bundledWorldCatalog()).get(worldId);
}
