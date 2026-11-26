// Opens the Three.js scene in headless Chromium. Shared by the renderer (src/render.mjs) and the checker (src/qa.mjs).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

export async function openStage(plan, { W = 1080, H = 1920 } = {}) {
  const server = http
    .createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = url.startsWith('/three/')
        ? path.join('node_modules/three', url.slice('/three/'.length))
        : path.join('web', url === '/' ? 'scene.html' : url);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(0);
  const port = server.address().port;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction('window.ready === true', { timeout: 60000 });
  await page.evaluate((p) => window.setup(p), plan);

  return {
    page,
    frame: (t) => page.evaluate((x) => window.renderFrame(x), t),
    // render the frame at time t, then read what is on screen / moving (see window.probe in web/scene.js)
    probe: (t) => page.evaluate((x) => { window.renderFrame(x); return window.probe(); }, t),
    close: async () => { await browser.close(); server.close(); },
  };
}
