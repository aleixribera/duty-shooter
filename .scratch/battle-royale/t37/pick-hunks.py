"""Writes the hunks of `git diff -- <file>` whose text matches (or, with -v, doesn't match) any of
the given substrings, as a patch on stdout for `git apply --cached`.
Usage: python pick-hunks.py [-v] <file> <substring>...
"""
import subprocess
import sys

args = sys.argv[1:]
invert = args[0] == '-v'
if invert:
    args = args[1:]
path, keys = args[0], args[1:]
diff = subprocess.run(['git', 'diff', '--no-color', '--', path], capture_output=True, check=True).stdout.decode('utf8')
lines = diff.splitlines(keepends=True)
head, hunks, cur = [], [], None
for line in lines:
    if line.startswith('@@'):
        cur = [line]
        hunks.append(cur)
    elif cur is None:
        head.append(line)
    else:
        cur.append(line)
picked = [h for h in hunks if any(k in ''.join(h) for k in keys) != invert]
if picked:
    sys.stdout.buffer.write((''.join(head) + ''.join(''.join(h) for h in picked)).encode('utf8'))
sys.stderr.write(f'{path}: {len(picked)} of {len(hunks)} hunks\n')
