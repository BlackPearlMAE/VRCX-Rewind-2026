#!/usr/bin/env python3
"""Extract world IDs from all retained own visits and observed friend locations, locally."""
import argparse
import json
from pathlib import Path
import re
import sqlite3
import uuid

ROOT = Path(__file__).resolve().parents[1]
LOCATION = re.compile(r'^wrld_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?=[:~/?#]|$)')
FRIEND_TABLE = re.compile(r'^usr[0-9a-f]{32}_(feed_gps|feed_online_offline)$')


def world_id(value):
    match = LOCATION.match(value or '')
    return 'wrld_' + str(uuid.UUID(match[1])) if match else None


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name+'.tmp')
    temporary.write_text(value,encoding='utf-8')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--cache',type=Path,default=ROOT/'private/world-thumbnail-cache.json')
    parser.add_argument('--output',type=Path,default=ROOT/'private/vrcx-world-candidates.txt')
    parser.add_argument('--missing-output',type=Path,default=ROOT/'private/vrcx-world-candidates-missing.txt')
    parser.add_argument('--report',type=Path,default=ROOT/'private/vrcx-world-candidate-summary.json')
    args = parser.parse_args()
    own, gps, presence = set(),set(),set()
    with sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro',uri=True,timeout=30) as db:
        db.execute('PRAGMA query_only=ON'); db.execute('PRAGMA trusted_schema=OFF')
        names={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'gamelog_location' not in names:
            parser.error('The database has no retained visit log')
        for row in db.execute('SELECT DISTINCT world_id,location FROM gamelog_location'):
            value = world_id(row[0]) or world_id(row[1])
            if value: own.add(value)
        # All retained history, including friends observed before a later unfriend.
        for table in sorted(names):
            match=FRIEND_TABLE.fullmatch(table)
            if not match: continue
            columns=['location','previous_location'] if match[1]=='feed_gps' else ['location']
            target=gps if match[1]=='feed_gps' else presence
            for column in columns:
                for (location,) in db.execute(f'SELECT DISTINCT "{column}" FROM "{table}"'):
                    value=world_id(location)
                    if value: target.add(value)
    friends=gps | presence
    all_worlds=own | friends
    cache=json.loads(args.cache.read_text(encoding='utf-8')) if args.cache.exists() else {}
    known={world for world,entry in cache.items() if entry.get('status')=='ok'}
    missing=all_worlds-known
    write(args.output,''.join(world+'\n' for world in sorted(all_worlds)))
    # Own unseen visits first, then additional unseen friend observations.
    missing_order=sorted(own-known)+sorted(friends-own-known)
    write(args.missing_output,''.join(world+'\n' for world in missing_order))
    report={'ownVisitedWorlds':len(own),'friendGpsWorlds':len(gps),'friendPresenceWorlds':len(presence),'friendObservedWorlds':len(friends),'overlapOwnAndFriends':len(own & friends),'uniqueCandidates':len(all_worlds),'alreadyInCatalog':len(all_worlds & known),'missingFromCatalog':len(missing),'ownMissing':len(own-known),'additionalFriendMissing':len(friends-own-known)}
    write(args.report,json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    print('Extracted only world UUIDs; no names, user IDs, instance IDs or raw locations written. No network requests made.')


if __name__=='__main__': main()
