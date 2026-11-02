import sys,json
for l in open(sys.argv[1]):
    if 'slow {' not in l: continue
    d=json.loads(l[l.index('slow {')+5:])
    print(d['wall'],d['cpu'],d['cause'],{k:v for k,v in d['phases'].items() if v>1},d['slowestBot'],{k:v for k,v in d['facts'].items() if v and k not in ('bytes','snapshots')},d['gc'])
