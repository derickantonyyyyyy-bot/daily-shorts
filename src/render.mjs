// Renders the Three.js scene frame by frame in headless Chromium (deterministic, not real-time).
import fs from 'node:fs';
import { openStage } from './stage.mjs';

const FPS = 30;
const plan = JSON.parse(fs.readFileSync('work/plan.json', 'utf8'));
const frames = Math.ceil(plan.duration * FPS);

fs.rmSync('work/frames', { recursive: true, force: true });
fs.mkdirSync('work/frames', { recursive: true });

const stage = await openStage(plan);
for (let i = 0; i < frames; i++) {
  await stage.frame(i / FPS);
  await stage.page.screenshot({ path: `work/frames/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
  if (i % 100 === 0) console.log(`frame ${i}/${frames}`);
}
await stage.close();
console.log('Rendered', frames, 'frames');
