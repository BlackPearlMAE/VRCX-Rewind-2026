#!/usr/bin/env python3
"""Maintainer-only catalog builder. The website ships only the resulting public image index."""
import argparse
import base64
import getpass
import hashlib
import http.cookiejar
import json
from pathlib import Path
import random
import runpy
import sys
import struct
import uuid
import time
import urllib.error
import urllib.parse
import urllib.request

from world_api_backoff import collection_allowed, rate_limited, request_succeeded

ROOT = Path(__file__).resolve().parents[1]
common = runpy.run_path(str(Path(__file__).with_name('collect-world-thumbnails.py')))
image_parts = common['image_parts']
atomic_write = common['atomic_write']
export_index = common['export_index']
WORLD = common['WORLD']


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Api:
    def __init__(self, contact, delay):
        self.cookies = http.cookiejar.CookieJar()  # Memory only; never saved/exported.
        self.opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(self.cookies))
        self.agent = 'VRCXWrappedWorldIndex/0.2 ' + contact
        self.delay = delay
        self.last = 0
        self.auth_started = False
        self.rate_limited = False
        self.operation = 'startup'
        self.failure_hint = ''
        self.failure_kind = ''

    def request(self, path, method='GET', body=None, authorization=None):
        if self.last:
            time.sleep(max(0, self.last + self.delay + random.uniform(0, .75) - time.monotonic()))
        headers = {'User-Agent':self.agent, 'Accept':'application/json'}
        if authorization:
            headers['Authorization'] = authorization
        if body is not None:
            headers['Content-Type'] = 'application/json'
        self.operation = ('sign-in' if authorization else '2FA verification' if path.startswith('auth/twofactorauth/') else 'session confirmation' if path == 'auth/user' else 'world metadata' if path.startswith('worlds/wrld_') else 'world listing' if path.startswith('worlds') else 'logout')
        self.failure_hint = ''
        self.failure_kind = ''
        request = urllib.request.Request('https://api.vrchat.cloud/api/1/' + path,
            headers=headers, data=json.dumps(body).encode() if body is not None else None, method=method)
        self.last = time.monotonic()
        try:
            with self.opener.open(request, timeout=25) as response:
                data = response.read(5_000_001)
                if len(data) > 5_000_000:
                    raise ValueError('Response too large')
                return json.loads(data)
        except urllib.error.HTTPError as error:
            if error.code == 403:
                # Keep only a classification, never cookies, headers or raw response text.
                if error.headers.get('cf-mitigated','').lower() == 'challenge':
                    self.failure_kind = 'browser-challenge'
                    self.failure_hint = 'The request was challenged by the edge service. Collection stopped; no attempt to bypass it.'
                elif 'application/json' in error.headers.get('Content-Type','').lower():
                    try:
                        payload = json.loads(error.read(8192))
                        details = payload.get('error',{})
                        message = str(details.get('message','') if isinstance(details,dict) else details).lower()
                        if any(word in message for word in ['offset','pagination','too many results','search limit']):
                            self.failure_kind = 'pagination-restriction'
                            self.failure_hint = 'VRChat reported a pagination/search restriction. This listing must not be paged further.'
                        else:
                            self.failure_kind = 'forbidden-json'
                    except (ValueError,AttributeError,TypeError):
                        self.failure_kind = 'forbidden-response'
                else:
                    self.failure_kind = 'forbidden-response'
            if error.code == 401:
                # Classify only known response messages. Never print/log the raw
                # body, credentials, cookies or request headers.
                try:
                    payload = json.loads(error.read(8192))
                    methods = payload.get('requiresTwoFactorAuth', [])
                    if path == 'auth/user' and isinstance(methods,list) and any(m in ('totp','emailOtp') for m in methods):
                        return {'requiresTwoFactorAuth':methods}
                    details = payload.get('error', {})
                    message = str(details.get('message','') if isinstance(details,dict) else details).lower()
                    if 'invalid username/email or password' in message:
                        self.failure_hint = 'VRChat reports an invalid login username/email or password. Use your account login, which may differ from your display name.'
                    elif 'missing credentials' in message:
                        self.failure_hint = 'VRChat reports missing credentials; the authentication header or session was not accepted.'
                    elif 'unauthorized' in message:
                        self.failure_hint = 'VRChat reports Unauthorized; this response does not establish whether the credentials or another authentication condition caused it.'
                except (ValueError,AttributeError,TypeError):
                    pass
            raise

    def login(self):
        # Only the maintainer running this local terminal enters their own details.
        # Do not add this feature to the website or request credentials from visitors.
        if not sys.stdin.isatty():
            raise RuntimeError('--login needs your own interactive local terminal')
        print('Local maintainer login. Password, code and cookies are not written to disk.')
        username = input('VRChat login username or email (not display name): ').strip()
        password = getpass.getpass('VRChat password: ')
        # Match VRCX's encodeURIComponent for each credential before Base64.
        uri_safe = "~!*'()"
        encoded = urllib.parse.quote(username, safe=uri_safe) + ':' + urllib.parse.quote(password, safe=uri_safe)
        basic = 'Basic ' + base64.b64encode(encoded.encode()).decode()
        self.auth_started = True
        try:
            user = self.request('auth/user', authorization=basic)
        finally:
            del password, encoded, basic
        methods = user.get('requiresTwoFactorAuth', [])
        if methods:
            kind = 'totp' if 'totp' in methods else 'emailotp' if 'emailOtp' in methods else None
            if not kind:
                raise RuntimeError('This login verification method is not supported; no automatic retry')
            code = getpass.getpass('Authenticator code: ' if kind == 'totp' else 'Email verification code: ')
            try:
                result = self.request('auth/twofactorauth/' + kind + '/verify', method='POST', body={'code':code})
            finally:
                del code
            if not result.get('verified'):
                raise RuntimeError('Verification failed; no automatic retry')
            user = self.request('auth/user')
        if not isinstance(user.get('id'), str) or not user['id'].startswith('usr_'):
            raise RuntimeError('Login did not complete')
        del user
        print('Local session ready; no account data will enter the catalog.')

    def close(self):
        if self.auth_started and len(self.cookies) and not self.rate_limited:
            try:
                self.request('logout', method='PUT')
                print('Local collection session logged out.')
            except Exception:
                print('Logout could not be confirmed; local cookies were discarded.')
        self.cookies.clear()


def wait_for_batch_pause(until):
    print('Batch checkpoint saved. Paused until ' + time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(until)) + '. Session stays in memory; Ctrl+C stops safely.',flush=True)
    while time.time() < until:
        time.sleep(min(30,max(0,until-time.time())))
    print('Batch break finished; continuing with the same session.',flush=True)


def sources(tags):
    result = [dict(endpoint='worlds/active', sort='popularity', releaseStatus='public')]
    for sort in ['popularity','favorites','heat','publicationDate']:
        result.append(dict(endpoint='worlds', sort=sort, releaseStatus='public'))
    # Platform-specific pools broaden selection beyond the combined global chart.
    for platform in ['android', 'standalonewindows']:
        for sort in ['popularity','favorites','publicationDate']:
            result.append(dict(endpoint='worlds', sort=sort, platform=platform, releaseStatus='public'))
    for tag in tags:
        for sort in ['popularity','publicationDate']:
            result.append(dict(endpoint='worlds', sort=sort, tag=tag, releaseStatus='public'))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-only', action='store_true', help='Rebuild the binary from saved metadata only; no network, login, or collection-state changes')
    parser.add_argument('--fetch', action='store_true', help='Make API requests; otherwise show the collection plan only')
    parser.add_argument('--login', action='store_true', help='Optional maintainer login in your own terminal; never saved')
    parser.add_argument('--contact', help='Public project URL or contact email for the identifying User-Agent')
    parser.add_argument('--limit', type=int, default=50000, help='Maximum worlds to retain, not a required collection count')
    parser.add_argument('--max-bytes', type=int, default=2000000)
    parser.add_argument('--max-requests', type=int, default=100, help='Maximum requests per run, or per batch with --auto-batches')
    parser.add_argument('--auto-batches', action='store_true', help='Continue batches with a saved break and the same in-memory login until the queue/ceiling is reached')
    parser.add_argument('--batch-pause', type=float, default=600, help='Seconds between automatic batches (minimum 600; default 600)')
    parser.add_argument('--delay', type=float, default=2, help='Minimum gap between requests, plus random jitter; minimum 2')
    parser.add_argument('--world-ids', type=Path, help='Optional UUID-only queue, processed after listings using this same API session, request budget and cooldowns')
    parser.add_argument('--tag', action='append', default=[], help='Additional exact world tag; repeat for category/community pools')
    parser.add_argument('--max-pages-per-source', type=int, default=10, help='Conservative local bound: 1000 results per listing; not an asserted official API limit')
    parser.add_argument('--restart-discovery', action='store_true', help='Restart listing cursors while retaining successful metadata')
    parser.add_argument('--cache', type=Path, default=ROOT/'private/world-thumbnail-cache.json')
    parser.add_argument('--state', type=Path, default=ROOT/'private/world-discovery-state.json')
    parser.add_argument('--output', type=Path, default=ROOT/'public/data/world-thumbnails.bin')
    args = parser.parse_args()
    if not 1 <= args.limit <= 100000 or args.max_bytes < 44 or args.max_requests < 1 or args.delay < 2 or args.max_pages_per_source < 1 or args.batch_pause < 600:
        parser.error('Invalid limit/budget/delay (request delay at least 2 seconds; batch break at least 600 seconds)')
    if args.export_only:
        if args.fetch or args.login:
            parser.error('--export-only cannot be combined with --fetch or --login')
        if not args.cache.is_file():
            parser.error('--export-only requires an existing metadata cache')
        cache = json.loads(args.cache.read_text(encoding='utf-8'))
        target = min(args.limit, (args.max_bytes - 8) // 36)
        selected = [world for world, entry in cache.items() if WORLD.fullmatch(world) and entry.get('status') == 'ok'][:target]
        try:
            count = export_index(args.output, selected, cache)
        except OSError as error:
            parser.exit(1, f'Local export failed: {error}\n')
        print(f'Exported {count:,} worlds / {args.output.stat().st_size:,} bytes from the saved cache. No API requests or login.')
        return
    if args.fetch and (not args.contact or any(c.isspace() for c in args.contact)):
        parser.error('--fetch requires --contact with your public project URL/contact email')
    seed_worlds = []
    if args.world_ids:
        for line in args.world_ids.read_text(encoding='utf-8-sig').splitlines():
            world = line.strip()
            if not world or world.startswith('#'):
                continue
            if not WORLD.fullmatch(world):
                parser.error('Invalid world ID in --world-ids')
            try:
                seed_worlds.append('wrld_' + str(uuid.UUID(world[5:])))
            except ValueError:
                parser.error('Invalid world UUID in --world-ids')
        seed_worlds = list(dict.fromkeys(seed_worlds))
    pools = sources(args.tag)
    target = min(args.limit, (args.max_bytes-8)//36)
    print(f'Maintainer catalog: up to {target:,} public worlds, at most {args.max_bytes:,} bytes; {len(pools)} listing pools.')
    print('Pools mix active/popular, favorites, heat, recent publications and Android/PC results; optional tags add categories/communities.')
    if args.auto_batches:
        print(f'Automatic batches of up to {args.max_requests} requests, with {args.batch_pause/60:g}-minute breaks and one in-memory login.')
    else:
        print(f'At most {args.max_requests} collection requests this run.')
    print('Listing pages contain up to 100 worlds; queued-ID lookups contain one. No image downloads.')
    print(f'Additional queued world IDs: {len(seed_worlds):,}; known and recently checked IDs will be skipped.')
    if not args.fetch:
        print('Plan only: no requests, login prompts or files written. Add --fetch --contact to collect; --login only if needed.')
        return
    backoff_path = args.cache.parent/'world-api-backoff.json'
    if not collection_allowed(backoff_path):
        return
    cache = json.loads(args.cache.read_text(encoding='utf-8')) if args.cache.exists() else {}
    if args.output.exists():
        content = args.output.read_bytes()
        if len(content) >= 8 and content[:4] == b'VWI1':
            count = struct.unpack_from('<I', content, 4)[0]
            if len(content) == 8 + count * 36:
                for offset in range(8, len(content), 36):
                    world = 'wrld_' + str(uuid.UUID(bytes=content[offset:offset+16]))
                    cache.setdefault(world, {'status':'ok', 'file':str(uuid.UUID(bytes=content[offset+16:offset+32])), 'version':struct.unpack_from('<I', content, offset+32)[0], 'checked':0})
    state = json.loads(args.state.read_text(encoding='utf-8')) if args.state.exists() else {'pools':{}, 'next':0, 'notBefore':0}
    if state.get('notBefore', 0) > time.time():
        print('Collection cooldown is active. Wait until ' + time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(state['notBefore'])))
        return
    if args.restart_discovery:
        state['pools'] = {}; state['next'] = 0
    api = Api(args.contact, args.delay)
    known = {w for w, entry in cache.items() if WORLD.fullmatch(w) and entry.get('status') == 'ok'}
    requests = 0
    batch_requests = 0
    batch_number = 1
    def selected():
        return [w for w, entry in cache.items() if WORLD.fullmatch(w) and entry.get('status') == 'ok'][:target]
    def save():
        atomic_write(args.cache, json.dumps(cache,separators=(',', ':'),sort_keys=True).encode())
        atomic_write(args.state, json.dumps(state,separators=(',', ':'),sort_keys=True).encode())
        return export_index(args.output, selected(), cache)
    def begin_collection_request():
        nonlocal requests, batch_requests, batch_number
        if batch_requests >= args.max_requests:
            if not args.auto_batches:
                return False
            until = time.time() + args.batch_pause
            state['batchPauseUntil'] = until
            state['completedBatches'] = state.get('completedBatches',0) + 1
            save()
            print(f'Batch {batch_number} finished: {batch_requests} requests; {requests} total this session.',flush=True)
            wait_for_batch_pause(until)
            state.pop('batchPauseUntil',None)
            batch_requests = 0
            batch_number += 1
            save()
        requests += 1
        batch_requests += 1
        return True
    try:
        # A restart during a scheduled break must respect its remaining duration.
        if state.get('batchPauseUntil',0) > time.time():
            wait_for_batch_pause(state['batchPauseUntil'])
        state.pop('batchPauseUntil',None)
        remaining_pools = [pool for pool in pools if not state['pools'].get(json.dumps(pool,sort_keys=True,separators=(',', ':')),{}).get('done',False) and state['pools'].get(json.dumps(pool,sort_keys=True,separators=(',', ':')),{}).get('offset',0) < args.max_pages_per_source * 100]
        fresh_after = time.time() - 30 * 86400
        remaining_seeds = [world for world in seed_worlds if world not in known and cache.get(world,{}).get('checked',0) < fresh_after]
        if len(known) >= target or (not remaining_pools and not remaining_seeds):
            print('Collection complete for the supplied sources or storage ceiling. Keeping the available catalog; no login or request needed.')
            return
        print(f'Resuming with {len(remaining_pools)} listing pools and {len(remaining_seeds):,} unchecked queued worlds.')
        if args.login:
            api.login()
        while len(known) < target:
            available = []
            for index, pool in enumerate(pools):
                key = json.dumps(pool,sort_keys=True,separators=(',', ':'))
                progress = state['pools'].setdefault(key, {'offset':0, 'empty':0, 'done':False})
                if not progress['done'] and progress['offset'] < args.max_pages_per_source * 100:
                    available.append(index)
            if not available:
                print('Listing phase complete. Continuing any supplied world-ID queue within the same request budget.')
                break
            index = next((i for i in available if i >= state['next']), available[0])
            pool = pools[index]
            state['next'] = (index + 1) % len(pools)
            key = json.dumps(pool,sort_keys=True,separators=(',', ':'))
            progress = state['pools'][key]
            params = {k:v for k,v in pool.items() if k != 'endpoint'}
            params.update(n=100, offset=progress['offset'], order='descending')
            if not begin_collection_request():
                break
            try:
                rows = api.request(pool['endpoint'] + '?' + urllib.parse.urlencode(params))
            except urllib.error.HTTPError as error:
                if error.code == 400:
                    progress['done'] = True
                    print(f'Listing pool rejected at offset {progress["offset"]}; skipping it.',flush=True)
                    save(); continue
                raise
            request_succeeded(backoff_path)
            if not isinstance(rows, list):
                raise ValueError('Listing did not return an array')
            added = 0
            for row in rows:
                if not isinstance(row,dict) or row.get('releaseStatus') != 'public':
                    continue
                world = row.get('id','')
                if not isinstance(world,str) or not WORLD.fullmatch(world):
                    continue
                parts = image_parts(row.get('thumbnailImageUrl')) or image_parts(row.get('imageUrl'))
                if not parts:
                    continue
                if world not in known:
                    if len(known) >= target:
                        break
                    added += 1
                cache[world] = {'status':'ok','file':parts[0],'version':parts[1],'checked':int(time.time())}
                known.add(world)
            progress['offset'] += len(rows)
            progress['empty'] = progress['empty'] + 1 if not added else 0
            # Global deduplication is not a reason to abandon a listing: deeper
            # pages may still contain worlds not present in other listing pools.
            page_ids = sorted(row.get('id','') for row in rows if isinstance(row,dict) and isinstance(row.get('id'),str))
            fingerprint = hashlib.sha256('\n'.join(page_ids).encode()).hexdigest()
            repeated_page = bool(page_ids) and progress.get('lastPageFingerprint') == fingerprint
            progress['lastPageFingerprint'] = fingerprint
            if len(rows) < 100 or repeated_page:
                progress['done'] = True
                progress['doneReason'] = 'end-of-list' if len(rows) < 100 else 'repeated-identical-page'
            count = save()
            print(f'Batch {batch_number}: {batch_requests}/{args.max_requests} requests ({requests} total), listing +{added} worlds; {count:,} worlds saved ({8+count*36:,} bytes; ceiling {target:,}).',flush=True)
        # Second phase: additional UUIDs, using the SAME Api instance and budget.
        # The queue remains local. Only individual world IDs enter metadata requests.
        for seed_world in remaining_seeds:
            if len(known) >= target:
                break
            if seed_world in known:
                continue
            if not begin_collection_request():
                break
            found_public = False
            try:
                row = api.request('worlds/' + seed_world)
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                cache[seed_world] = {'status':'unavailable','checked':int(time.time())}
            else:
                request_succeeded(backoff_path)
                if not isinstance(row,dict) or row.get('id') != seed_world:
                    raise ValueError('World metadata ID mismatch')
                parts = image_parts(row.get('thumbnailImageUrl')) or image_parts(row.get('imageUrl'))
                if row.get('releaseStatus') == 'public' and parts:
                    cache[seed_world] = {'status':'ok','file':parts[0],'version':parts[1],'checked':int(time.time())}
                    known.add(seed_world)
                    found_public = True
                else:
                    # No image details from nonpublic metadata enter the catalog/cache.
                    cache[seed_world] = {'status':'unavailable','checked':int(time.time())}
            checkpoint = state.setdefault('seedProgress',{'completedRequests':0})
            checkpoint['completedRequests'] += 1
            checkpoint['lastCheckedWorld'] = seed_world
            checkpoint['lastCheckedAt'] = int(time.time())
            count = save()
            outcome = 'public image added' if found_public else 'unavailable or nonpublic'
            print(f'Batch {batch_number}: {batch_requests}/{args.max_requests} requests ({requests} total), queued world {outcome}; {count:,} worlds saved ({8+count*36:,} bytes).',flush=True)

    except urllib.error.HTTPError as error:
        failure = {'httpStatus':error.code, 'operation':api.operation, 'kind':api.failure_kind, 'at':int(time.time())}
        if api.operation == 'world listing':
            failure.update(source=pool, offset=progress['offset'])
            print('Refused listing: ' + json.dumps({'source':pool,'offset':progress['offset']},ensure_ascii=True))
        if api.operation == 'world metadata':
            failure['worldId'] = seed_world
            print('Queued-world metadata request refused; progress before this ID is saved.')
        state['lastFailure'] = failure
        if api.failure_hint and error.code != 401:
            print(api.failure_hint)
        if error.code == 429:
            api.rate_limited = True
            until,wait = rate_limited(backoff_path,error.headers.get('Retry-After',''))
            state['notBefore'] = until
            print(f'Rate limited: stopped; shared exponential cooldown saved ({int(wait)} seconds). No automatic retry.')
        elif error.code == 401:
            if api.operation == 'sign-in':
                print('VRChat rejected the sign-in request (HTTP 401). Collection has not started.')
            elif api.operation == '2FA verification':
                print('VRChat rejected the verification step (HTTP 401). No automatic retry.')
            elif args.login:
                print(f'VRChat rejected {api.operation} (HTTP 401); the authenticated session was not accepted. No automatic retry.')
            else:
                print('World listings require login. Re-run in your own terminal with --login; never send credentials in chat.')
            if api.failure_hint:
                print(api.failure_hint)
        else:
            state['notBefore'] = time.time() + 300
            print(f'Stopped on HTTP {error.code}; five-minute cooldown saved. No automatic retry.')
    except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError, EOFError):
        state['notBefore'] = time.time() + 300
        print('Collection/login stopped; five-minute cooldown saved. No credentials or response contents logged.')
    except OSError as error:
        print(f'Collection stopped on a local file error: {error}. Attempting a final local checkpoint.')
    except KeyboardInterrupt:
        print('Stopped by maintainer; progress retained.')
    finally:
        try:
            count = save()
        except OSError as error:
            print(f'Final local save failed: {error}')
            print('Existing checkpoints are retained. After the file lock clears, use --export-only to rebuild from the saved cache without API requests.')
            raise SystemExit(1) from None
        finally:
            api.close()
        print(f'Catalog now has {count:,} worlds / {args.output.stat().st_size:,} bytes. {requests} collection requests this run.')


if __name__ == '__main__':
    main()
