"""Exercise only the native mount guard, never Docker or project/dependency code."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

source = (Path(__file__).resolve().parent / 'run-security-container.sh').read_text()
guard = re.search(r'^assert_private_mount\(\) \{\n.*?^\}', source, re.M | re.S).group(0)
bash = r'C:\Program Files\Git\bin\bash.exe' if os.name == 'nt' else '/bin/bash'
owner = subprocess.check_output([bash, '-p', '-c', 'id -u'], text=True).strip()


class NativeMountGuardTests(unittest.TestCase):
    def setUp(self):
        parent = Path(__file__).resolve().parent
        self.temporary = tempfile.TemporaryDirectory(prefix='.mount-fixture-', dir=parent)
        self.root = Path(self.temporary.name).resolve()
        self.assertTrue(self.root.is_relative_to(parent))
        self.addCleanup(self.temporary.cleanup)
        self.data = self.root / 'data'
        self.data.mkdir()
        self.work = self.data / 'work'
        self.work.mkdir()
        credentials = self.root / 'credentials'
        credentials.mkdir()
        self.sentinel = credentials / 'runtime.env'
        self.sentinel.write_bytes(b'synthetic private fixture')

    def checked(self, candidate, expected=None):
        arguments = 'candidate=$1; expected=$2'
        if os.name == 'nt':
            arguments = 'candidate=$(cygpath -u -- "$1"); expected=$(cygpath -u -- "$2")'
        program = 'set -euo pipefail\n' + guard + '\n' + arguments + '\nassert_private_mount "$candidate" "$expected" "$3"\n'
        return subprocess.run([bash, '-p', '-c', program, 'fixture', str(candidate), str(expected or candidate), owner], capture_output=True, text=True).returncode

    def test_regular_owned_work_directory_passes(self):
        self.assertEqual(self.checked(self.data), 0)
        self.assertEqual(self.checked(self.work), 0)

    def test_work_relative_parent_link_cannot_expose_private_sibling(self):
        self.work.rmdir()
        self.work.symlink_to('..', target_is_directory=True)
        self.assertNotEqual(self.checked(self.work), 0)
        self.assertEqual(self.sentinel.read_bytes(), b'synthetic private fixture')

    def test_reused_data_source_cannot_be_a_link_even_when_target_is_in_tree(self):
        substitute = self.root / 'substitute'
        substitute.symlink_to('data', target_is_directory=True)
        self.assertNotEqual(self.checked(substitute), 0)


if __name__ == '__main__':
    unittest.main()
