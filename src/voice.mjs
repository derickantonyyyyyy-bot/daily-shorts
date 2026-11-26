// Narration, one line per beat, so the camera cuts land exactly on the words.
// Human-sounding touches: irregular micro-pauses (longer after questions), soft breaths between some lines,
// warm EQ (boost 100-250 Hz, soften the harsh highs) and a very quiet room-tone bed instead of dead digital silence.
// Voice: edge-tts, pitched down for a deeper tone. Override with TTS_VOICE / TTS_PITCH / TTS_RATE.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = JSON.parse(fs.readFileSync('work/script.json', 'utf8'));
const FAKE = process.env.VOICE_FAKE === '1'; // test mode: sine tones instead of edge-tts
const VOICE = process.env.TTS_VOICE || 'en-US-GuyNeural';
const PITCH = process.env.TTS_PITCH || '-14Hz';
const RATE = process.env.TTS_RATE || '-4%';
const PY = process.env.PYTHON || 'python';
const DIR = 'work/vo';
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || r.error?.message || '').slice(-500)}`);
  return r.stdout;
};
const dur = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());
const wav = (n) => `${DIR}/${n}.wav`;

// deterministic randomness per video, so a re-render sounds the same
let seed = [...script.title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const silence = (n, d) => run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', d.toFixed(3), '-c:a', 'pcm_s16le', wav(n)]);
const breath = (n) =>
  run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anoisesrc=d=0.4:c=pink:a=0.6:r=44100',
    '-af', 'highpass=f=400,lowpass=f=3200,afade=t=in:d=0.15,afade=t=out:st=0.2:d=0.2,volume=0.10', '-ac', '1', '-c:a', 'pcm_s16le', wav(n)]);

function tts(text, out) {
  if (FAKE) {
    const secs = (text.split(/\s+/).length * 0.38).toFixed(2);
    run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `sine=frequency=${110 + Math.round(rnd() * 60)}:duration=${secs}`, '-ar', '44100', '-ac', '1', out]);
  } else {
    run(PY, ['-m', 'edge_tts', '--voice', VOICE, `--pitch=${PITCH}`, `--rate=${RATE}`, `--text=${text}`, '--write-media', out]);
  }
}

const segs = [];
const timing = [];
silence('lead', 0.15);
segs.push('lead');
let t = 0.15;

script.beats.forEach((b, i) => {
  const mp3 = `${DIR}/${i}.mp3`;
  tts(b.text, mp3);
  run('ffmpeg', ['-y', '-i', mp3, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', wav(`c${i}`)]);
  const start = i === 0 ? 0 : t; // a cut lands on the first word of its line
  segs.push(`c${i}`);
  t += dur(wav(`c${i}`));
  if (i < script.beats.length - 1) {
    const gap = 0.12 + rnd() * 0.22 + (/\?$/.test(b.text.trim()) ? 0.15 : 0); // micro-pause, longer after a question
    silence(`g${i}`, gap);
    segs.push(`g${i}`);
    t += gap;
    if (rnd() < 0.45) { // a soft breath before some lines
      breath(`b${i}`);
      silence(`p${i}`, 0.05);
      segs.push(`b${i}`, `p${i}`);
      t += dur(wav(`b${i}`)) + 0.05;
    }
  }
  timing.push({ start, end: t });
});

const list = segs.map((n) => `file '${path.resolve(wav(n))}'`).join('\n');
fs.writeFileSync(`${DIR}/list.txt`, list);
run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', `${DIR}/list.txt`, '-c', 'copy', `${DIR}/raw.wav`]);

// warmth + room tone (the aresample steps matter: loudnorm outputs 192 kHz and a mismatched amix silently shortens the audio)
const chain = [
  '[0:a]highpass=f=60,equalizer=f=170:t=h:w=150:g=3,bass=g=4:f=110,treble=g=-3:f=6000,loudnorm=I=-16:TP=-1.5,aresample=44100[v]',
  '[1:a]lowpass=f=700,volume=0.035,aresample=44100[r]',
  '[v][r]amix=inputs=2:duration=first:normalize=0[out]',
].join(';');
run('ffmpeg', ['-y', '-i', `${DIR}/raw.wav`, '-f', 'lavfi', '-i', `anoisesrc=d=${(t + 1).toFixed(2)}:c=brown:a=0.5:r=44100`,
  '-filter_complex', chain, '-map', '[out]', '-ar', '44100', '-b:a', '192k', 'work/voice.mp3']);

fs.writeFileSync('work/timing.json', JSON.stringify({ beats: timing, duration: t }, null, 2));
console.log(`Voice ready: ${script.beats.length} lines, ${t.toFixed(1)}s (${FAKE ? 'TEST TONES' : VOICE + ' ' + PITCH})`);
