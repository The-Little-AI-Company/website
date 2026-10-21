import importlib.util
import io
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch

script = Path(__file__).resolve().parent.parent / '.github/actions/security-ci/pack-regular.py'
spec = importlib.util.spec_from_file_location('company_regular_packer', script)
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)


class RegularArtifactTests(unittest.TestCase):
    def setUp(self):
        parent = Path(__file__).resolve().parent
        self.temporary = tempfile.TemporaryDirectory(prefix='.pack-fixture-', dir=parent)
        self.root = Path(self.temporary.name).resolve()
        self.assertTrue(self.root.is_relative_to(parent))
        self.addCleanup(self.temporary.cleanup)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        self.file = self.dist / 'index.html'
        self.file.write_text('A regular static page.', encoding='utf-8')
        self.output = self.root / 'artifact.tar'

    def test_pages_archive_has_only_regular_relative_content(self):
        (self.dist / '.env').write_bytes(b'synthetic hidden fixture')
        hidden = self.dist / '.internal'
        hidden.mkdir()
        (hidden / 'data').write_bytes(b'synthetic hidden directory fixture')
        # Windows lacks O_NOFOLLOW. This positive data fixture does not create links.
        # The production Linux flag remains mandatory and is not changed by this test.
        with patch.object(packer.os, 'O_NOFOLLOW', getattr(os, 'O_NOFOLLOW', 0), create=True):
            packer.pack_artifact(self.root, self.output, 'pages')
        with tarfile.open(self.output) as archive:
            self.assertEqual(archive.getnames(), ['index.html'])
            self.assertEqual(archive.extractfile('index.html').read(), b'A regular static page.')
            self.assertTrue(all(member.isreg() or member.isdir() for member in archive.getmembers()))

    def test_rejects_symlink_root_and_hardlinked_file(self):
        with patch.object(Path, 'is_symlink', return_value=True):
            with self.assertRaisesRegex(SystemExit, 'regular directory'):
                packer.pack_artifact(self.root, self.output, 'pages')
        original = Path.lstat

        def linked(path, *args, **kwargs):
            metadata = original(path, *args, **kwargs)
            if path == self.file:
                values = list(metadata)
                values[3] = 2
                return os.stat_result(values)
            return metadata

        with patch.object(Path, 'lstat', linked):
            with self.assertRaisesRegex(SystemExit, 'hardlinks'):
                packer.pack_artifact(self.root, self.output, 'pages')
        self.assertFalse(self.output.exists())

    def test_rejects_interior_special_file_and_out_of_tree_walk(self):
        original = Path.lstat

        def special(path, *args, **kwargs):
            metadata = original(path, *args, **kwargs)
            if path == self.file:
                values = list(metadata)
                values[0] = stat.S_IFIFO | 0o600
                return os.stat_result(values)
            return metadata

        with patch.object(Path, 'lstat', special):
            with self.assertRaisesRegex(SystemExit, 'special files'):
                packer.pack_artifact(self.root, self.output, 'pages')
        outside = self.root / 'outside'
        outside.mkdir()
        (outside / 'data').write_bytes(b'outside')
        with patch.object(packer.os, 'walk', return_value=[(str(outside), [], ['data'])]):
            with self.assertRaises(ValueError):
                packer.pack_artifact(self.root, self.output, 'pages')
        self.assertFalse(self.output.exists())

    def test_existing_destination_and_missing_report_fail_without_overwrite(self):
        self.output.write_bytes(b'retain')
        with self.assertRaises(FileExistsError):
            packer.pack_artifact(self.root, self.output, 'pages')
        self.assertEqual(self.output.read_bytes(), b'retain')
        with self.assertRaises(SystemExit) as result:
            packer.pack_artifact(self.root, self.root / 'report.tar', 'report')
        self.assertEqual(result.exception.code, 3)


if __name__ == '__main__':
    unittest.main()
