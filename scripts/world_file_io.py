"""Atomic collector checkpoints with bounded retries for temporary Windows file locks."""
import errno
from pathlib import Path
import tempfile
import time


def atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Use a unique sibling, closing it before replacement. Keep the previous
    # checkpoint intact until the new file can be atomically installed.
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
        except BaseException:
            stream.close()
            temporary.unlink(missing_ok=True)
            raise
    for attempt in range(8):
        try:
            temporary.replace(path)
            return
        except OSError as error:
            locked = isinstance(error, PermissionError) or getattr(error, 'winerror', None) in (5, 32, 33)
            if not locked:
                raise
            if attempt == 7:
                # Preserve the complete staged file for manual recovery.
                raise PermissionError(errno.EACCES,
                    f'Could not replace {path} after 8 attempts. Close programs holding this file or wait for the lock to clear. '
                    f'The previous file is unchanged; the new content is retained at {temporary}.') from error
            time.sleep(min(.1 * 2 ** attempt, 2))
