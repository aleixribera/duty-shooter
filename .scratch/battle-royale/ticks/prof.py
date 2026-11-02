import json,sys,glob,collections
f=sorted(glob.glob(sys.argv[1]+'/*.cpuprofile'))[-1]
p=json.load(open(f)); nodes={n['id']:n for n in p['nodes']}
parent={}
for n in p['nodes']:
    for c in n.get('children',[]): parent[c]=n['id']
def stack(i):
    out=[]
    while i is not None:
        out.append(nodes[i]['callFrame']['functionName'] or '(anon)'); i=parent.get(i)
    return out
samples=p['samples']; deltas=p['timeDeltas']
t=p['startTime']; rows=[]
for s,d in zip(samples,deltas):
    t+=d; rows.append((t,stack(s),d))
# contiguous runs under #tick... grouped by GameServer tick()
runs=[]; cur=None
for t,st,d in rows:
    if 'tick' in st and 'loop' in st:
        if cur is None or t-cur['end']>2000: cur={'start':t,'end':t,'rows':[]}; runs.append(cur)
        cur['end']=t; cur['rows'].append((st,d))
    else:
        pass
runs.sort(key=lambda r:-(r['end']-r['start']))
print('samples',len(rows),'tick runs',len(runs))
for r in runs[:int(sys.argv[2])]:
    ms=(r['end']-r['start'])/1000
    self=collections.Counter(); path=collections.Counter()
    for st,d in r['rows']:
        self[st[0]]+=d
        i=st.index('tick'); path[' > '.join(reversed(st[max(0,i-5):i]))]+=d
    print(f"--- tick {ms:.1f} ms at +{(r['start']-p['startTime'])/1e6:.1f}s")
    print('  self:',', '.join(f"{k} {v/1000:.1f}" for k,v in self.most_common(10)))
    for k,v in path.most_common(5): print(f"  {v/1000:5.1f}  {k}")
