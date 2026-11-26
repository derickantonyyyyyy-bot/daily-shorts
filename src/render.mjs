// Renders the Three.js scene frame by frame in headless Chromium (deterministic, not real-time).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const FPS = 30;
const W = 1080;
const H = 1920;
const plan = JSON.parse(fs.readFileSync('work/plan.json', 'utf8'));
const frames = Math.ceil(plan.duration * FPS);

fs.rmSync('work/frames', { recursive: true, force: true });
fs.mkdirSync('work/frames', { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
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
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction('window.ready === true', { timeout: 60000 });
await page.evaluate((p) => window.setup(p), plan);

for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.renderFrame(t), i / FPS);
  await page.screenshot({
    path: `work/frames/f${String(i).padStart(5, '0')}.jpg`,
    type: 'jpeg',
    quality: 90,
  });
  if (i % 100 === 0) console.log(`frame ${i}/${frames}`);
}

await browser.close();
server.close();
console.log('Rendered', frames, 'frames');
