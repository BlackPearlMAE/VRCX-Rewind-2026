"""Offline collector checkpoint/export regression checks. No login or API requests."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from world_file_io import atomic_write


class CollectorWrites(unittest.TestCase):
    def test_transient_windows_lock_is_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'catalog.bin'
            target.write_bytes(b'old')
            replace = Path.replace
            attempts = []
            def locked_then_replace(source, destination):
                attempts.append(source)
                if len(attempts) < 3:
                    raise PermissionError('synthetic temporary lock')
                return replace(source, destination)
            with patch('world_file_io.Path.replace', locked_then_replace), patch('world_file_io.time.sleep') as sleep:
                atomic_write(target, b'new')
            self.assertEqual(target.read_bytes(), b'new')
            self.assertEqual(len(attempts), 3)
            self.assertEqual(sleep.call_count, 2)
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])

    def test_persistent_lock_preserves_both_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'catalog.bin'
            target.write_bytes(b'old')
            with patch('world_file_io.Path.replace', side_effect=PermissionError('synthetic lock')) as replace, patch('world_file_io.time.sleep'):
                with self.assertRaisesRegex(PermissionError, 'new content is retained'):
                    atomic_write(target, b'new')
            self.assertEqual(replace.call_count, 8)
            self.assertEqual(target.read_bytes(), b'old')
            staged = list(Path(directory).glob('*.tmp'))
            self.assertEqual(len(staged), 1)
            self.assertEqual(staged[0].read_bytes(), b'new')

    def test_export_only_never_constructs_api_or_rewrites_cache(self):
        script = Path(__file__).resolve().parents[1] / 'scripts/discover-world-thumbnails.py'
        namespace = runpy.run_path(str(script))
        main = namespace['main']
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / 'cache.json'
            output = Path(directory) / 'worlds.bin'
            content = json.dumps({'wrld_00000000-0000-0000-0000-000000000001': {
                'status': 'ok', 'file': '00000000-0000-0000-0000-000000000002', 'version': 3
            }})
            cache.write_text(content)
            with patch.dict(main.__globals__, {'Api': lambda *args: self.fail('API must not start')}), patch.object(sys, 'argv', [str(script), '--export-only', '--cache', str(cache), '--output', str(output)]), contextlib.redirect_stdout(io.StringIO()):
                main()
            payload = output.read_bytes()
            self.assertEqual(payload[:4], b'VWI1')
            self.assertEqual(struct.unpack_from('<I', payload, 4)[0], 1)
            self.assertEqual(len(payload), 44)
            self.assertEqual(cache.read_text(), content)


if __name__ == '__main__':
    unittest.main()
