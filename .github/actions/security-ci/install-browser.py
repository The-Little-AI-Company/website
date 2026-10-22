"""Build-time fixed Chrome archive acquisition. Authenticate bytes before ZIP parsing."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import sys
import urllib.request
import zipfile

URL = 'https://storage.googleapis.com/chrome-for-testing-public/156.0.8078.47/linux64/chrome-linux64.zip'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Chrome redirect refused')

def validate_directory_bound(archive):
    size = archive.stat().st_size
    with archive.open('rb') as source:
        source.seek(max(0, size - 65557))
        tail = source.read(65557)
    offset = tail.rfind(b'PK\x05\x06')
    if offset < 0 or len(tail) - offset < 22:
        raise ValueError('Missing ZIP end directory')
    _, disk, cd_disk, on_disk, count, cd_size, cd_offset, comment_size = struct.unpack('<4s4H2LH', tail[offset:offset+22])
    eocd_position = size - len(tail) + offset
    if (disk or cd_disk or on_disk != count or count == 65535 or count > 10000 or
            cd_size > 8388608 or cd_offset + cd_size != eocd_position or
            offset + 22 + comment_size != len(tail)):
        raise ValueError('Unsupported or oversized ZIP directory')

def validate_entries(entries, max_entries=10000, max_expanded=1073741824):
    if len(entries) > max_entries:
        raise ValueError('Too many ZIP entries')
    seen, total, executable = set(), 0, 0
    for info in entries:
        name = info.filename
        parts = PurePosixPath(name).parts
        mode = info.external_attr >> 16
        kind = stat.S_IFMT(mode)
        if (not name or len(name) > 512 or len(parts) > 20 or '\\' in name or ':' in name or any(ord(c) < 32 or ord(c) == 127 for c in name) or name.startswith('/') or
                getattr(info, 'orig_filename', name) != name or
                any(p in ('', '.', '..') for p in name.rstrip('/').split('/')) or
                not parts or parts[0] != 'chrome-linux64' or name in seen or
                kind not in (0, stat.S_IFREG, stat.S_IFDIR) or mode & 0o7000 or
                info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
            raise ValueError('Unsupported Chrome ZIP entry')
        seen.add(name)
        total += info.file_size
        if info.file_size < 0 or total > max_expanded or info.file_size > 536870912:
            raise ValueError('Chrome ZIP expansion bound exceeded')
        if name == 'chrome-linux64/chrome' and not info.is_dir():
            executable += 1
    if executable != 1:
        raise ValueError('Expected exactly one Chrome executable')

def main():
    policy = json.loads(Path('/opt/company/browser-policy.json').read_text())
    artifact = policy['artifact']
    if (policy['version'] != '156.0.8078.47' or artifact['url'] != URL or
            not re.fullmatch('[a-f0-9]{64}', artifact.get('sha256') or '') or
            type(artifact.get('bytes')) is not int or not 0 < artifact['bytes'] <= 536870912 or
            artifact['maxBytes'] != 536870912 or artifact['maxEntries'] != 10000 or
            artifact['maxExpandedBytes'] != 1073741824):
        raise ValueError('Chrome artifact authentication is not finalized')
    archive = Path(sys.argv[1]) / 'chrome-linux64.zip'
    opener = urllib.request.build_opener(NoRedirect)
    total, digest = 0, hashlib.sha256()
    with opener.open(URL, timeout=60) as response, archive.open('xb') as output:
        if response.url != URL:
            raise ValueError('Chrome origin changed')
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > artifact['bytes']:
                raise ValueError('Chrome artifact size exceeded')
            digest.update(chunk)
            output.write(chunk)
    # No ZIP parser or downloaded executable has run before this authentication boundary.
    if total != artifact['bytes'] or digest.hexdigest() != artifact['sha256']:
        raise ValueError('Chrome artifact digest or size mismatch')
    validate_directory_bound(archive)
    root = Path('/opt/google/chrome')
    root.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        validate_entries(entries)
        for info in entries:
            relative = PurePosixPath(info.filename).parts[1:]
            if not relative:
                continue
            destination = root.joinpath(*relative)
            if info.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            remaining = info.file_size
            with source.open(info) as content, destination.open('xb') as output:
                while chunk := content.read(65536):
                    remaining -= len(chunk)
                    if remaining < 0:
                        raise ValueError('Chrome member size mismatch')
                    output.write(chunk)
            if remaining != 0:
                raise ValueError('Chrome member truncated')
            destination.chmod(0o555 if (info.external_attr >> 16) & 0o111 else 0o444)
    executable = root / 'chrome'
    if not os.access(executable, os.X_OK):
        raise ValueError('Chrome executable mode missing')
    installed = {'version': policy['version'], 'archiveSha256': digest.hexdigest(), 'archiveBytes': total,
                 'executableSha256': hashlib.sha256(executable.read_bytes()).hexdigest()}
    Path('/opt/company/browser-installed.json').write_text(json.dumps(installed) + '\n')
    Path('/opt/company/browser-installed.json').chmod(0o444)

if __name__ == '__main__':
    main()
