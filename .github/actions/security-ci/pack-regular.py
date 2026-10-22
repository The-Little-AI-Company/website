"""Archive only bounded regular output files, without following links or running project code."""
import os
from pathlib import Path
import stat
import sys
import tarfile

def pack_artifact(source, destination, mode):
    base = source.resolve(strict=True)
    if mode == 'pages':
        roots = [('dist', '.')]
    elif mode == 'report':
        roots = [(name, name) for name in ['playwright-report', 'test-results'] if (base / name).exists()]
    else:
        raise SystemExit('Unreviewed archive mode.')
    if not roots:
        raise SystemExit(3)

    entries = []
    total = 0
    for local, prefix in roots:
        root = base / local
        if root.is_symlink() or not root.is_dir():
            raise SystemExit('Artifact root must be a regular directory.')
        for current, directories, files in os.walk(root, followlinks=False):
            # Preserve the original Pages/upload actions' include-hidden-files=false.
            directories[:] = [name for name in directories if not name.startswith('.')]
            for name in sorted(directories + [name for name in files if not name.startswith('.')]):
                path = Path(current) / name
                metadata = path.lstat()
                relative = path.relative_to(root).as_posix()
                if any(ord(c) < 32 for c in relative) or '\\' in relative:
                    raise SystemExit('Artifact paths contain unsupported characters.')
                if not path.resolve(strict=True).is_relative_to(root.resolve(strict=True)):
                    raise SystemExit('Artifact path escapes its root.')
                if not (stat.S_ISREG(metadata.st_mode) or stat.S_ISDIR(metadata.st_mode)):
                    raise SystemExit('Artifact links and special files are refused.')
                if stat.S_ISREG(metadata.st_mode) and metadata.st_nlink != 1:
                    raise SystemExit('Artifact hardlinks are refused.')
                if stat.S_ISREG(metadata.st_mode):
                    total += metadata.st_size
                # GitHub Pages rejects archive entries that do not start with ./ (actions/deploy-pages#203).
                entries.append((path, prefix + '/' + relative, metadata))
                if len(entries) > 30000 or total > 512 * 1024 * 1024:
                    raise SystemExit('Artifact exceeds its reviewed bounds.')

    with destination.open('xb') as output, tarfile.open(fileobj=output, mode='w', format=tarfile.GNU_FORMAT) as archive:
        for path, name, metadata in entries:
            info = tarfile.TarInfo(name)
            info.uid = info.gid = info.mtime = 0
            info.uname = info.gname = ''
            if stat.S_ISDIR(metadata.st_mode):
                info.type = tarfile.DIRTYPE
                info.mode = 0o755
                archive.addfile(info)
            else:
                descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                with os.fdopen(descriptor, 'rb') as stream:
                    actual = os.fstat(stream.fileno())
                    if (actual.st_dev, actual.st_ino, actual.st_size, actual.st_mtime_ns) != (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns):
                        raise SystemExit('Artifact changed during preparation.')
                    info.size = actual.st_size
                    info.mode = 0o644
                    archive.addfile(info, stream)
    print('Prepared a bounded regular-file artifact without runtime credentials.')


if __name__ == "__main__":
    pack_artifact(Path("/work"), Path("/publish/artifact.tar"), sys.argv[1])
