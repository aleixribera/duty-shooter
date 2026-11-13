(async () => {
  while (!document.body.dataset.bake || !globalThis.duty?.game) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 8000));
  return await new Promise((done) => {
    const r = duty.renderer;
    const backend = r.backend;
    let world = null;
    const realDirect = r._renderObjectDirect;
    r._renderObjectDirect = function (object) {
      let o = object; while (o.parent) o = o.parent;
      if (o.isScene && o.children.length >= 10) { world = o; r._renderObjectDirect = realDirect; }
      return realDirect.apply(this, arguments);
    };
    const loaded = Promise.resolve({}).then((t) => { globalThis.__Basic = t.MeshBasicNodeMaterial; }, (e) => done('import failed: ' + e));
    let on = true;
    let counting = false;
    let sky = null;
    const set = (v) => {
      on = v;  if (globalThis.__ao) { const A = globalThis.__ao; A.__real ??= A.samples.value; A.samples.value = v ? A.__real : 3; A.useTemporalFiltering = v ? false : true; }
      if (!world) return;
      if ('ao:3:1' === 'sky') { sky ??= world.backgroundNode; world.backgroundNode = v ? sky : null; }
      if ('ao:3:1' === 'lights') world.traverse((x) => { if (x.isPointLight) x.visible = v; });
      if ('ao:3:1' === 'env') { sky ??= world.environment; world.environment = v ? sky : null; }
      if ('ao:3:1' === 'sunshadow') world.traverse((x) => { if (x.isDirectionalLight) x.castShadow = v; });
      if ('ao:3:1' === 'models') world.traverse((x) => { if (x.isMesh && x.material?.isMeshStandardNodeMaterial) x.visible = v; });
      if ('ao:3:1' === 'modelsflat') world.traverse((x) => {
        if (!x.isMesh) return;
        x.userData.realMat ??= x.material;
        const m = x.userData.realMat;
        if (!m?.isMeshStandardNodeMaterial) return;
        x.userData.flatMat ??= new globalThis.__Basic({ color: m.color, map: m.map, alphaTest: m.alphaTest, side: m.side, transparent: m.transparent });
        x.material = v ? m : x.userData.flatMat;
      });
      if ('ao:3:1' === 'modelsrecv') world.traverse((x) => { if (x.isMesh && x.material?.isMeshStandardNodeMaterial) x.receiveShadow = v; });
      if ('ao:3:1' === 'modelsplain') world.traverse((x) => {
        if (!x.isMesh) return;
        x.userData.realMat ??= x.material;
        const m = x.userData.realMat;
        if (!m?.isMeshStandardNodeMaterial) return;
        x.userData.plainMat ??= m.clone();
        x.material = v ? m : x.userData.plainMat;
      });
      if ('ao:3:1' === 'prepass' || 'ao:3:1' === 'prepassall') {
        if (!globalThis.__pre) {
          globalThis.__pre = [];
          const depthOnly = new globalThis.__Basic({ colorWrite: false });
          const all = 'ao:3:1' === 'prepassall';
          const meshes = []; world.traverse((x) => { const m = x.material; if (!x.isMesh || x.isInstancedMesh || !m || Array.isArray(m) || m.transparent || m.alphaTest > 0 || !x.visible) return; if (all ? x.geometry.attributes.position.count > 100 : (m.isMeshStandardNodeMaterial && x.geometry.index && x.geometry.index.count > 3000)) meshes.push(x); });
          console.log('prepass meshes', meshes.length);
          for (const x of meshes) { const c = new x.constructor(x.geometry, depthOnly); c.renderOrder = -1; c.matrixAutoUpdate = false; c.matrix = x.matrix; c.matrixWorld = x.matrixWorld; c.frustumCulled = x.frustumCulled; x.parent.add(c); globalThis.__pre.push(c); }
        }
        for (const c of globalThis.__pre) c.visible = v;
      }
      if ('ao:3:1' === 'depthfirst') world.traverse((x) => { if (x.name === 'depth-first') x.visible = v; });
      if ('ao:3:1' === 'ground') world.traverse((x) => { if (x.name === 'ground') { x.userData.wasVisible ??= x.visible; x.material.visible = v; } });
      if ('ao:3:1' === 'groundflat') world.traverse((x) => {
        if (x.name !== 'ground') return;
        x.userData.realMat ??= x.material;
        globalThis.__groundFlat ??= new globalThis.__Basic({ color: 0x7a7060 });
        x.material = v ? x.userData.realMat : globalThis.__groundFlat;
      });
      if ('ao:3:1' === 'groundalt') world.traverse((x) => {
        if (x.name !== 'ground') return;
        x.userData.realMat ??= x.material;
        if (!globalThis.__groundAltMat) { globalThis.__gv = ""; globalThis.__groundAltMat = globalThis.__groundMat(); globalThis.__gv = ''; }
        x.material = v ? x.userData.realMat : globalThis.__groundAltMat;
      });
      if ('ao:3:1' === 'groundrecv') world.traverse((x) => { if (x.name === 'ground') x.receiveShadow = v; });
      if ('ao:3:1' === 'leafrecv') world.getObjectByName('plants')?.traverse((x) => { if (x.isInstancedMesh && x.material?.alphaTest > 0) x.receiveShadow = v; });
      if ('ao:3:1' === 'leafalt') world.getObjectByName('plants')?.traverse((x) => {
        if (!x.isInstancedMesh) return;
        x.userData.realMat ??= x.material;
        if (!(x.userData.realMat.alphaTest > 0)) return;
        if (!globalThis.__leafAltMat) { globalThis.__gv = ""; globalThis.__leafAltMat = globalThis.__leafMat(); globalThis.__gv = ''; }
        x.material = v ? x.userData.realMat : globalThis.__leafAltMat;
      });
      if ('ao:3:1' === 'leafequal') {
        if (!globalThis.__leafEq) {
          globalThis.__leafEq = [];
          const leaves = []; world.getObjectByName('plants')?.traverse((x) => { if (x.isInstancedMesh && x.material?.alphaTest > 0) leaves.push(x); });
          const mats = new Map();
          for (const x of leaves) {
            let d = mats.get(x.material);
            if (!d) { d = globalThis.__leafDepthMat(); mats.set(x.material, d); }
            const t = new x.constructor(x.geometry, d, x.instanceMatrix.count);
            t.instanceMatrix = x.instanceMatrix;
            t.renderOrder = -1; t.frustumCulled = false; t.castShadow = false; t.receiveShadow = false;
            x.parent.add(t);
            globalThis.__leafEq.push([x, t]);
          }
          globalThis.__leafEqMats = [...mats.keys()];
          console.log('leaf twins', leaves.length, mats.size);
          const sync = () => { for (const [x, t] of globalThis.__leafEq) { t.count = x.count; t.visible = x.visible && globalThis.__leafEqOn; } requestAnimationFrame(sync); };
          sync();
        }
        globalThis.__leafEqOn = v;
        for (const m of globalThis.__leafEqMats) { m.alphaTest = v ? 0 : 0.5; m.depthFunc = v ? 4 : 3; m.depthWrite = !v; m.needsUpdate = true; }
      }
      if ('ao:3:1' === 'plants') { const p = world.getObjectByName('plants'); if (p) p.visible = v; }
    };
    const names = new Map();
    const stateOf = new Map();
    const realBegin = backend.beginRender;
    backend.beginRender = function (ctx) {
      const t = ctx.renderTarget;
      const name = t ? (t.texture?.name || 'rt') + ' ' + t.width + 'x' + t.height + (t.samples > 1 ? ' x' + t.samples : '') : 'screen';
      const result = realBegin.apply(this, arguments);
      const uid = backend.get(ctx).timestampUID;
      if (uid) { names.set(uid.split(':f')[0], name); stateOf.set(uid, counting ? (on ? 'on' : 'off') : 'skip'); }
      return result;
    };
    const sums = { on: new Map(), off: new Map() };
    const frames = { on: new Set(), off: new Set() };
    const pool = backend.timestampQueryPool.render;
    const realResolve = pool._resolveQueries.bind(pool);
    pool._resolveQueries = async function () {
      const total = await realResolve();
      for (const [uid, ms] of pool.timestamps) {
        const state = stateOf.get(uid); stateOf.delete(uid);
        if (state !== 'on' && state !== 'off') continue;
        const [, id, frame] = uid.match(/^(.*):f(\d+)$/);
        const key = names.get(id) ?? ('ctx ' + id);
        sums[state].set(key, (sums[state].get(key) ?? 0) + ms);
        frames[state].add(frame);
      }
      return total;
    };
    // Switch a while first so both states' shaders exist, then count, skipping the frames around each switch.
    let step = 0;
    const tick = () => {
      step++;
      counting = false;
      try { set(!on); } catch (e) { done('switch failed: ' + e); return; }
      if (step > 2 * 8 + 2) {
        backend.beginRender = realBegin;
        const keys = [...new Set([...sums.on.keys(), ...sums.off.keys()])];
        const per = (s, k) => (sums[s].get(k) ?? 0) / Math.max(1, frames[s].size);
        const rows = keys.map((k) => [k, per('on', k), per('off', k)]).sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([k, a, b]) => a.toFixed(3).padStart(7) + ' on ' + b.toFixed(3).padStart(7) + ' off ' + (a - b).toFixed(3).padStart(7) + ' diff  ' + k);
        const total = (s) => [...sums[s].values()].reduce((a, b) => a + b, 0) / Math.max(1, frames[s].size);
        done(JSON.stringify({ frames: [frames.on.size, frames.off.size], onMs: total('on').toFixed(3), offMs: total('off').toFixed(3), rows }, null, 1));
        return;
      }
      setTimeout(() => { if (step > 2) counting = true; }, 400);
      setTimeout(tick, 2500);
    };
    loaded.then(() => setTimeout(tick, 500));
  });
})()