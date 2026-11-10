# Sets each gun's place in the mix from the last tune-guns run: reads tune.json, compares each
# weapon's loudness (LUFS, loudest 400 ms, outdoor and indoor averaged) with the targets below and
# rewrites the `gain: { local, near, far }` line of its recipe in gunshot.ts.
#   node .scratch/next-level/audio/tune-guns.mjs first,near,far outdoor,indoor && python .scratch/next-level/audio/calibrate-guns.py
# or from a full table (three shots a row): python .scratch/next-level/audio/calibrate-guns.py guns-after.json
import io, json, re, os, sys
here = os.path.dirname(os.path.abspath(__file__))
TARGET = {
    'first': {'sniper': -16.7, 'shotgun': -17.2, 'm4a1': -19.8, 'smg': -23.0, 'pistol': -24.3},
    'near': {'sniper': -25.5, 'shotgun': -26.5, 'm4a1': -29.0, 'smg': -33.3, 'pistol': -34.3},
    'far': {'sniper': -36.5, 'shotgun': -37.2, 'm4a1': -38.2, 'smg': -41.4, 'pistol': -42.0},
}
KEY = {'first': 'local', 'near': 'near', 'far': 'far'}
rows = json.load(open(os.path.join(here, sys.argv[1] if len(sys.argv) > 1 else 'tune.json')))
for r in rows: r['place'] = r['place'].split('-')[0].replace('first', 'first')
path = os.path.join(here, '../../../packages/fps-client/src/audio/gunshot.ts')
s = io.open(path, encoding='utf-8', newline='').read()
for weapon in ['m4a1', 'smg', 'shotgun', 'sniper', 'pistol']:
    i = s.index('  %s: {' % weapon)
    m = re.compile(r"gain: \{ local: ([\d.]+), near: ([\d.]+), far: ([\d.]+) \}").search(s, i)
    g = {'local': float(m.group(1)), 'near': float(m.group(2)), 'far': float(m.group(3))}
    for place, key in KEY.items():
        got = [r['lufs'] for r in rows if r['weapon'] == weapon and r['place'] == place]
        if not got: continue
        delta = TARGET[place][weapon] - sum(got) / len(got)
        g[key] = round(g[key] * 10 ** (delta / 20), 2)
        print('%-8s %-6s %+5.1f dB -> %.2f' % (weapon, key, delta, g[key]))
    s = s[:m.start()] + 'gain: { local: %s, near: %s, far: %s }' % (g['local'], g['near'], g['far']) + s[m.end():]
io.open(path, 'w', encoding='utf-8', newline='').write(s)
