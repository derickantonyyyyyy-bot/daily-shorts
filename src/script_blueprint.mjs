// Default script writer: the 10-scene "blueprint" format (see src/blueprint.mjs).
// Writes work/script.json in the same shape the rest of the pipeline already reads.
import fs from 'node:fs';
import { director, parseJson } from './llm.mjs';
import { todaysLane } from './human.mjs';
import { buildPrompt, validate, toScript } from './blueprint.mjs';

fs.mkdirSync('work', { recursive: true });
fs.mkdirSync('data', { recursive: true });
const histPath = 'data/history.json';
const history = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
const recent = history.slice(-60).map((h) => h.title).join(' | ') || 'none yet';
const lane = todaysLane();
const prompt = buildPrompt(lane, recent);

let bp, lastErr;
for (let attempt = 1; attempt <= 2 && !bp; attempt++) {
  try {
    bp = validate(parseJson(await director(prompt, { max: 6000 })));
  } catch (e) {
    lastErr = e;
    console.warn(`Blueprint attempt ${attempt} failed: ${e.message.slice(0, 200)}`);
  }
}
if (!bp) throw lastErr;
for (const w of bp.warnings) console.warn('blueprint repaired:', w);

const script = toScript(bp);
fs.writeFileSync('work/script.json', JSON.stringify(script, null, 2));
fs.writeFileSync('work/blueprint.json', JSON.stringify(bp, null, 2));
fs.writeFileSync('work/narration.txt', script.beats.map((b) => b.text).join(' '));
history.push({ date: new Date().toISOString().slice(0, 10), title: script.title, setting: script.setting.name });
fs.writeFileSync(histPath, JSON.stringify(history.slice(-200), null, 2));
console.log(`Blueprint script ready (${lane}): ${script.title} | ${script.beats.length} scenes, ${script.props.length} props`);
