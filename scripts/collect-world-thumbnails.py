#!/usr/bin/env python3
"""Plan or collect a compact public-world thumbnail index. Python standard library only."""
import argparse
import json
from pathlib import Path
import random
import re
import sqlite3
import struct
import time
import urllib.error
import urllib.request
import uuid

from world_api_backoff import collection_allowed, rate_limited, request_succeeded
from world_file_io import atomic_write

ROOT = Path(__file__).resolve().parents[1]
WORLD = re.compile(r"wrld_([0-9a-fA-F-]{36})\Z")
IMAGE = re.compile(r"https://api\.vrchat\.cloud/api/1/(?:image|file)/file_([0-9a-fA-F-]{36})/(\d+)/(?:\d+|file)\Z")


def image_parts(url):
    match = IMAGE.fullmatch(url or "")
    if not match:
        return None
    try:
        file_id = str(uuid.UUID(match[1]))
        version = int(match[2])
        return [file_id, version] if 0 <= version <= 0xffffffff else None
    except ValueError:
        return None


def read_candidates(databases, year):
    stats, monthly, known = {}, {}, {}
    for database in databases:
        with sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True, timeout=15) as db:
            db.execute("PRAGMA query_only=ON")
            db.execute("PRAGMA trusted_schema=OFF")
            # Selection weights only, not corrected recap statistics. Never read configs/auth.
            rows = db.execute("""SELECT world_id,substr(created_at,1,7),COUNT(*),SUM(MAX(0,COALESCE(time,0)))
                FROM gamelog_location WHERE world_id LIKE 'wrld_%'
                AND created_at>=? AND created_at<? GROUP BY world_id,substr(created_at,1,7)""",
                (f"{year}-01-01", f"{year+1}-01-01"))
            for world, month, visits, duration in rows:
                if not WORLD.fullmatch(world):
                    continue
                try:
                    uuid.UUID(world[5:])
                except ValueError:
                    continue
                count, total = stats.get(world, (0, 0))
                stats[world] = (count + visits, total + duration)
                key = (world, month)
                monthly[key] = monthly.get(key, 0) + duration
            try:
                for world, thumbnail, image in db.execute("SELECT id,thumbnail_image_url,image_url FROM cache_world WHERE release_status='public'"):
                    parts = image_parts(thumbnail) or image_parts(image)
                    if parts:
                        known[world] = parts
            except sqlite3.OperationalError:
                pass
    priorities = []
    # Preserve each month's largest single-world playtime candidate first.
    for month in sorted({month for _, month in monthly}):
        worlds = [w for w, m in monthly if m == month]
        if worlds:
            priorities.append(min(worlds, key=lambda w: (-monthly[w, month], w)))
    visits = sorted(stats, key=lambda w: (-stats[w][0], w))
    hours = sorted(stats, key=lambda w: (-stats[w][1], w))
    # Alternate rankings rather than letting one long visit dominate the whole list.
    for first, second in zip(visits, hours):
        priorities.extend([first, second])
    return list(dict.fromkeys(priorities)), stats, known


def export_index(path, selected, cache):
    rows = []
    for world in sorted(selected):
        entry = cache.get(world, {})
        if entry.get("status") != "ok":
            continue
        try:
            rows.append(uuid.UUID(world[5:]).bytes + uuid.UUID(entry["file"]).bytes + struct.pack("<I", entry["version"]))
        except (ValueError, KeyError, struct.error):
            continue
    atomic_write(path, b"VWI1" + struct.pack("<I", len(rows)) + b"".join(rows))
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, action="append", default=[], help="Read-only VRCX database; repeat to combine selection priorities")
    parser.add_argument("--world-ids", type=Path, help="Additional world IDs, one per line; these take priority")
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--limit", type=int, default=50000, help="Maximum worlds selected (default: 50000)")
    parser.add_argument("--max-bytes", type=int, default=2000000, help="Hard raw lookup budget including header (default: 2000000 bytes)")
    parser.add_argument("--fetch", action="store_true", help="Actually request anonymous public world metadata; otherwise plan only")
    parser.add_argument("--max-requests", type=int, default=100, help="Hard per-run request budget (default: 100)")
    parser.add_argument("--delay", type=float, default=2, help="Minimum seconds between requests, plus random jitter (minimum: 2)")
    parser.add_argument("--refresh-days", type=float, default=30, help="Reuse cached results for this long (minimum: 1 day)")
    parser.add_argument("--contact", help="Public project URL or contact email for the required API User-Agent")
    parser.add_argument("--cache", type=Path, default=ROOT/"private/world-thumbnail-cache.json")
    parser.add_argument("--output", type=Path, default=ROOT/"public/data/world-thumbnails.bin")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100000 or args.max_requests < 1 or args.delay < 2 or args.refresh_days < 1:
        parser.error("Use 1-100000 worlds, a positive request budget, at least 2 seconds delay and at least 1 day cache retention")
    if args.max_bytes < 44:
        parser.error("--max-bytes must fit the header and at least one 36-byte entry")
    if args.fetch and (not args.contact or any(c.isspace() for c in args.contact)):
        parser.error("--fetch requires --contact with a public project URL or contact email (no whitespace)")
    ranked, stats, known = read_candidates(args.database, args.year)
    seeds = []
    if args.world_ids:
        for line in args.world_ids.read_text(encoding="utf-8-sig").splitlines():
            world = line.strip()
            if not world or world.startswith("#"):
                continue
            if not WORLD.fullmatch(world):
                parser.error("Invalid world ID in --world-ids")
            try:
                uuid.UUID(world[5:])
            except ValueError:
                parser.error("Invalid world UUID in --world-ids")
            seeds.append(world)
    ranked = list(dict.fromkeys(seeds + ranked))
    if not ranked:
        parser.error("Supply --database and/or --world-ids with at least one candidate")
    capacity = (args.max_bytes - 8) // 36
    selected = ranked[:min(args.limit, capacity)]
    print(f"Raw lookup budget: {args.max_bytes:,} bytes; capacity {capacity:,} worlds.")
    cache = json.loads(args.cache.read_text(encoding="utf-8")) if args.cache.exists() else {}
    # Preserve an existing published lookup even when starting a new private cache.
    if args.output.exists():
        content = args.output.read_bytes()
        if len(content) >= 8 and content[:4] == b"VWI1":
            count = struct.unpack_from("<I", content, 4)[0]
            if len(content) == 8 + count * 36:
                for offset in range(8, len(content), 36):
                    world = "wrld_" + str(uuid.UUID(bytes=content[offset:offset+16]))
                    cache.setdefault(world, {"status":"ok", "file":str(uuid.UUID(bytes=content[offset+16:offset+32])), "version":struct.unpack_from("<I", content, offset+32)[0], "checked":0})
    now = time.time()
    # Reuse known public VRCX cache URLs without making requests.
    for world in selected:
        if world not in cache and world in known:
            cache[world] = {"status":"ok", "file":known[world][0], "version":known[world][1], "checked":int(now)}
    stale_before = now - args.refresh_days * 86400
    pending = [w for w in selected if cache.get(w, {}).get("checked", 0) < stale_before]
    total_visits = sum(v[0] for v in stats.values())
    print(f"{len(ranked):,} candidate worlds; {len(selected):,} selected; {len(pending):,} need metadata refresh.")
    for size in sorted({min(n, len(ranked)) for n in [100,250,500,1000,args.limit]}):
        covered = sum(stats.get(w,(0,0))[0] for w in ranked[:size])
        share = f"{covered/total_visits:.1%} of recorded visits" if total_visits else "seed list only"
        print(f"  {size:,} worlds: {share}; maximum index {8 + size*36:,} bytes")
    print("Selection uses monthly time winners, then alternates visit and raw recorded-duration rankings.")
    if not args.fetch:
        print(f"Plan only. No files written or requests sent. A fetch run will make at most {min(len(pending),args.max_requests)} requests.")
        return
    backoff_path = args.cache.parent/"world-api-backoff.json"
    if not collection_allowed(backoff_path):
        return
    atomic_write(args.cache, json.dumps(cache,separators=(",", ":"),sort_keys=True).encode())
    # Do not follow unexpected metadata redirects to other services.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    requests = 0
    try:
        for world in pending[:args.max_requests]:
            if requests:
                time.sleep(args.delay + random.uniform(0, .75))
            request = urllib.request.Request("https://api.vrchat.cloud/api/1/worlds/" + world,
                headers={"User-Agent":f"VRCXWrappedWorldIndex/0.1 {args.contact}", "Accept":"application/json"})
            requests += 1
            try:
                with opener.open(request, timeout=20) as response:
                    payload = response.read(2_000_001)
                    if len(payload) > 2_000_000:
                        raise ValueError("Metadata response too large")
                    data = json.loads(payload)
                request_succeeded(backoff_path)
                if data.get("id") != world:
                    raise ValueError("World ID mismatch")
                parts = image_parts(data.get("thumbnailImageUrl")) or image_parts(data.get("imageUrl"))
                if data.get("releaseStatus") == "public" and parts:
                    cache[world] = {"status":"ok", "file":parts[0], "version":parts[1], "checked":int(time.time())}
                else:
                    cache[world] = {"status":"unavailable", "checked":int(time.time())}
                print(f"{requests}/{min(len(pending),args.max_requests)}: {cache[world]['status']}", flush=True)
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    cache[world] = {"status":"unavailable", "checked":int(time.time())}
                    print(f"{requests}: unavailable (404)",flush=True)
                elif error.code == 403:
                    print("Stopped on HTTP 403; retaining existing metadata. No automatic retry or assumption that the world is private.",flush=True)
                    break
                else:
                    if error.code == 429:
                        _,wait = rate_limited(backoff_path,error.headers.get("Retry-After",""))
                        print(f"Stopped on HTTP 429; shared exponential cooldown {int(wait)} seconds. No automatic retry.",flush=True)
                    else:
                        print(f"Stopped on HTTP {error.code}. No automatic retry.",flush=True)
                    break
            except (urllib.error.URLError, TimeoutError, ValueError) as error:
                print(f"Stopped on {type(error).__name__}; progress retained. No automatic retry.",flush=True)
                break
            finally:
                atomic_write(args.cache, json.dumps(cache,separators=(",", ":"),sort_keys=True).encode())
    except KeyboardInterrupt:
        print("Stopped; progress retained.")
    finally:
        # Supplemental seeds extend the full existing catalog; never replace it with only this seed batch.
        catalog_worlds = [w for w,e in cache.items() if e.get("status") == "ok"][:min(args.limit,capacity)]
        count = export_index(args.output, catalog_worlds, cache)
        print(f"Exported {count:,} world thumbnails: {args.output.stat().st_size:,} bytes. {requests} metadata requests; zero image downloads.")


if __name__ == "__main__":
    main()
