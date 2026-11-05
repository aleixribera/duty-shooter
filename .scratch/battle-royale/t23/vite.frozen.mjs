// A dev server that never reloads the page (other sessions edit this checkout), proxying to the t23 server.
import { defineConfig } from 'vite';
import { largeMapNav } from '../../../apps/range/nav/plugin.ts';
import { bakeLighting } from '../../../apps/range/bake/plugin.ts';
const SERVER = process.env.DUTY_SERVER ?? 'http://127.0.0.1:3231';
export default defineConfig({
  root: 'apps/range',
  base: './',
  plugins: [bakeLighting(['survival-town', 'switchyard', 'crash', 'range']), largeMapNav()],
  server: { hmr: false, watch: null, port: Number(process.env.VPORT ?? 5231), strictPort: true,
    proxy: { '/ws': { target: SERVER, ws: true }, '/healthz': SERVER, '/status': SERVER, '/royale': { target: SERVER, ws: true } } },
});
