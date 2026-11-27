"""Shared, persistent exponential rate-limit back-off for maintainer collectors."""
import json
from pathlib import Path
import random
import time
from email.utils import parsedate_to_datetime
from world_file_io import atomic_write


def read_state(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def write_state(path, value):
    atomic_write(path, json.dumps(value,separators=(',', ':')).encode('utf-8'))


def collection_allowed(path):
    until = float(read_state(path).get('notBefore',0))
    if until > time.time():
        print('Shared API cooldown active until ' + time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(until)))
        return False
    return True


def rate_limited(path, retry_after):
    state = read_state(path)
    strikes = min(16,max(0,int(state.get('strikes',0)))) + 1
    try:
        server_wait = max(0,float(retry_after or 0))
    except ValueError:
        try:
            server_wait = max(0,parsedate_to_datetime(retry_after).timestamp()-time.time())
        except (ValueError,TypeError,OverflowError):
            server_wait = 0
    # No automated retry: these are minimum waits before a later manual restart.
    exponential = min(21600,300 * (2 ** min(strikes-1,7)))
    wait = max(exponential,server_wait) + random.uniform(0,30)
    until = time.time()+wait
    write_state(path,{'strikes':strikes,'notBefore':until})
    return until,wait


def request_succeeded(path):
    if path.exists() and read_state(path).get('strikes',0):
        write_state(path,{'strikes':0,'notBefore':0})
