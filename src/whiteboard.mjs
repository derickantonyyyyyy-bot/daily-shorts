// Whiteboard mode: redraws the finished scenes as a hand sketching them on beige paper (srt-whiteboard-animation by 江哥是老登啊, MIT,
// bundled in tools/whiteboard/). For every scene one rendered frame is turned into a pencil sketch with a pale colour wash
// (tools/whiteboard/sketch.py), split into regions (background first, then the biggest subjects), and drawn stroke by stroke.
// Needs work/frames (run after render.mjs), work/plan.json and work/final.mp3. Python needs: opencv-python-headless, numpy.
//   WB_OUT       output file (default out/video_whiteboard.mp4; the workflow sets out/video.mp4 when VIDEO_STYLE=whiteboard)
//   WB_HAND=0    draw without the hand (bare pen tip)
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const PY = process.env.PYTHON || 'python3';
const FPS = 30;
const OUT = process.env.WB_OUT || 'out/video_whiteboard.mp4';
const plan = JSON.parse(fs.readFileSync('work/plan.json', 'utf8'));
const lastFrame = Math.ceil(plan.duration * FPS) - 1;
const frameAt = (t) => `work/frames/f${String(Math.min(lastFrame, Math.max(0, Math.round(t * FPS)))).padStart(5, '0')}.jpg`;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || r.stdout || '').slice(-600)}`);
  return r.stdout;
}

fs.rmSync('work/wb', { recursive: true, force: true });
fs.mkdirSync('work/wb', { recursive: true });
fs.mkdirSync('out', { recursive: true });

const clips = [];
for (let i = 0; i < plan.beats.length; i++) {
  const b = plan.beats[i];
  const ms = Math.max(1500, Math.round((b.end - b.start) * 1000));
  const t = b.impactAt ?? b.start + 0.6 * (b.end - b.start); // the frame where the thing being described is on screen
  const prefix = `work/wb/s${String(i + 1).padStart(2, '0')}`;
  run(PY, ['tools/whiteboard/sketch.py', frameAt(t), prefix, String(ms)]);
  const args = ['tools/whiteboard/render_stream_whiteboard.py', `${prefix}.png`, `${prefix}.annotation.json`, `${prefix}.mp4`,
    'tools/whiteboard/drawing-hand.png', '--fps', String(FPS), '--cap-long-edge', '1280', '--total-ms', String(ms)];
  if (process.env.WB_HAND === '0') args.push('--bare-tip');
  run(PY, args);
  // every clip exactly as long as its scene, at the final size
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${prefix}.mp4`, '-vf', `scale=1080:1920:flags=lanczos,fps=${FPS},setsar=1,tpad=stop_mode=clone:stop_duration=1`,
    '-t', (b.end - b.start).toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', `${prefix}_f.mp4`]);
  clips.push(`s${String(i + 1).padStart(2, '0')}_f.mp4`);
  console.log(`scene ${i + 1}/${plan.beats.length} drawn`);
}

fs.writeFileSync('work/wb/list.txt', clips.map((c) => `file '${c}'`).join('\n'));
run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'work/wb/list.txt', '-i', 'work/final.mp3',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', plan.duration.toFixed(3), OUT]);
console.log('Whiteboard video:', OUT);
