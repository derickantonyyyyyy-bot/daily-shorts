// Merges script + props + timing into one plan for the renderer and the SFX mixer.
// Uses exact per-line timings from work/timing.json (written by src/voice.mjs); falls back to word-count timing.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const script = JSON.parse(fs.readFileSync('work/script.json', 'utf8'));
const props = JSON.parse(fs.readFileSync('work/props.json', 'utf8')).props;
const timing = fs.existsSync('work/timing.json') ? JSON.parse(fs.readFileSync('work/timing.json', 'utf8')) : null;
const useTiming = timing && timing.beats?.length === script.beats.length;
const audioLen = useTiming
  ? timing.duration
  : parseFloat(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'work/voice.mp3']).toString().trim()
    );

const TAIL = 0.7; // silent hold at the end
const words = script.beats.map((b) => b.text.split(/\s+/).length);
const total = words.reduce((a, b) => a + b, 0);

let t = 0;
const beats = script.beats.map((b, i) => {
  let start, end;
  if (useTiming) ({ start, end } = timing.beats[i]);
  else {
    start = t;
    end = t + (words[i] / total) * audioLen;
    t = end;
  }
  return { ...b, caption: b.text, start, end };
});
beats[beats.length - 1].end += TAIL;
// Moment an object lands (same constants as web/scene.js): inside the slow-mo zone on ramp beats.
for (const b of beats) {
  if (b.motion) b.impactAt = b.start + (b.ramp ? 0.5556 : 0.85) * (b.end - b.start);
}

const plan = {
  duration: audioLen + TAIL,
  setting: script.setting,
  names: { A: script.characters.A.name, B: script.characters.B.name },
  props,
  beats,
};
fs.writeFileSync('work/plan.json', JSON.stringify(plan, null, 2));
console.log(`Timeline: ${beats.length} beats, ${plan.duration.toFixed(1)}s (${useTiming ? 'exact line timings' : 'word-count timings'})`);
