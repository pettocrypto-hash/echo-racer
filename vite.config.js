import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Erzeugt nach dem Build einen Service Worker, der alle Dateien aus dist/ vorab zwischenspeichert
// (offline spielbar im Solo-Modus). Version = Hash über die Dateinamen.
function serviceWorker() {
  let outDir = 'dist';
  let root = '.';
  return {
    name: 'echo-racer-sw',
    apply: 'build',
    configResolved(cfg) {
      root = cfg.root;
      outDir = path.resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      const files = [];
      const walk = (dir) => {
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else files.push(path.relative(outDir, p).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const assets = ['./', ...files.filter((f) => f !== 'sw.js').map((f) => './' + f)];
      const tpl = fs.readFileSync(path.resolve(root, 'sw-template.js'), 'utf8');
      let h = 0;
      for (const ch of assets.join('|') + tpl) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
      const version = 'echo-racer-' + (h >>> 0).toString(36);
      const code = tpl.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets, null, 2));
      fs.writeFileSync(path.join(outDir, 'sw.js'), code);
      console.log(`\n[sw] ${assets.length} Dateien vorgemerkt (${version})`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  server: { host: true, port: Number(process.env.PORT) || 5173 },
  preview: { host: true, port: Number(process.env.PORT) || 4173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
});
