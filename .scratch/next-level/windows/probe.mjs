// Ticket 59 debug: which glass materials the house panes draw with, and their opacity.
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const chrome = await launchChrome();
try {
  await chrome.navigate('http://localhost:5191/?explore=survival-town&nolock&at=20,-25,1.9');
  await chrome.waitFor('globalThis.duty?.game?.player', 120_000);
  await sleep(2000);
  console.log(await chrome.evaluate(`(() => { const out = []; const g = globalThis.duty.game; const scene = g.scene ?? g.renderer?.scene ?? g.world?.scene; if (!scene) return 'no scene: ' + Object.keys(g).join(','); scene.traverse((o) => { const m = o.material; if (o.isMesh && m && m.transparent && !m.depthWrite) out.push([o.name, o.geometry?.attributes?.position?.count, m.type, m.opacityNode ? 'node' : m.opacity]); }); return JSON.stringify(out.slice(0, 30)); })()`));
} finally { await chrome.close(); }
