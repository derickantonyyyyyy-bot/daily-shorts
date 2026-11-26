// ElevenLabs is used for sound effects ONLY (the narration stays on edge-tts).
// Generates one clip per beat that has an "sfx", then mixes them over the voice at each beat's start.
// Without ELEVENLABS_API_KEY (or on failure) the voice track is used as-is.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const plan = JSON.parse(fs.readFileSync('work/plan.json', 'utf8'));
const key = process.env.ELEVENLABS_API_KEY;
fs.mkdirSync('work/sfx', { recursive: true });

const clips = [];
if (key) {
  for (const [i, b] of plan.beats.entries()) {
    if (!b.sfx) continue;
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: b.sfx.text,
          duration_seconds: b.sfx.seconds, // explicit duration keeps credit use predictable
          prompt_influence: 0.5,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const file = `work/sfx/${i}.mp3`;
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      clips.push({ file, at: Math.max(0, b.impactAt ?? b.start + 0.1) }); // impact-synced when an object hits
      console.log(`SFX ${i}: ${b.sfx.text}`);
    } catch (e) {
      console.warn(`SFX ${i} failed (${e.message}), skipping`);
    }
  }
} else {
  console.warn('ELEVENLABS_API_KEY not set, no sound effects.');
}

if (!clips.length) {
  fs.copyFileSync('work/voice.mp3', 'work/mix.mp3');
} else {
  const args = ['-y', '-i', 'work/voice.mp3'];
  clips.forEach((c) => args.push('-i', c.file));
  const delays = clips.map((c, n) => {
    const ms = Math.round(c.at * 1000);
    return `[${n + 1}:a]adelay=${ms}|${ms},volume=0.7[s${n}]`;
  });
  const labels = ['[0:a]', ...clips.map((_, n) => `[s${n}]`)].join('');
  const filter = `${delays.join(';')};${labels}amix=inputs=${clips.length + 1}:duration=longest:normalize=0[out]`;
  args.push('-filter_complex', filter, '-map', '[out]', 'work/mix.mp3');
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
}
// Pad with silence to the full video length so the closing hold is not cut off by -shortest at encode time.
execFileSync('ffmpeg', ['-y', '-i', 'work/mix.mp3', '-af', 'apad', '-t', String(plan.duration), 'work/final.mp3'], { stdio: 'ignore' });
console.log('Audio ready: work/final.mp3');
