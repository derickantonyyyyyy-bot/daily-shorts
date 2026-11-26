# Daily Shorts

Every day at **3:30 PM IST** (cron `0 10 * * *` UTC), GitHub Actions will:

1. **Claude directs** (or Groq, if there is no Anthropic key) in the **10-scene blueprint format** (one sentence per scene; every scene picks a place, anchor and camera from a fixed directory in `src/blueprint.mjs`, so objects never float; set `SCRIPT_FORMAT=classic` for the older two-character format). The older description follows: a real, lesser-known fact in that weekday's lane, two characters with a relationship and a stake, a setting, 3-5 purposeful props, and per-beat staging (poses, eye lines, who holds what, camera focus, sound effects)
2. **Groq models the props** as 3D primitives (box, sphere, cylinder, cone, capsule) in three passes with three keys: create (up to 10 parts), enhance (up to 16, fixes proportions and missing defining features), polish (up to 24, detail, wear, material variety). A failed pass keeps the previous result
3. **edge-tts narrates one line per scene** (`src/voice.mjs`): deep voice (`en-US-GuyNeural`, pitch -14Hz), irregular micro-pauses (longer after questions), soft breaths between some lines, warm EQ (boost around 170 Hz, softened highs) and a very quiet room-tone bed. Exact line timings drive the camera cuts
4. **ElevenLabs makes sound effects only**, mixed in at each beat's start
5. **Three.js renders** 1080x1920: stiff mannequins, stepped robotic easing, eye lines toward the action, held objects that drag posture by weight, camera focus and layered foreground/midground/background
6. Encodes the MP4, publishes it as a **GitHub Release**, commits the script to `archive/`, uploads to YouTube as a Short

## Setup (one time)

1. Create a GitHub repo and push this folder to it.
2. Repo **Settings > Secrets and variables > Actions**, add secrets:
   - `ANTHROPIC_API_KEY` (from console.anthropic.com) for the script. Optional: without it Groq writes the script
   - `GROQ_API_KEY_1`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3` (console.groq.com) for prop modelling in three passes: key 1 creates each object, key 2 enhances it to look like what it means, key 3 polishes it with fine detail. One key alone also works (it is reused for all three passes); without any, props are plain placeholder blocks
   - `ELEVENLABS_API_KEY` for sound effects. Without it the video has voice only
   - `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` (for YouTube, see below)
3. Repo **Settings > Actions > General > Workflow permissions**: set to *Read and write*.
4. Run it once by hand: **Actions > Daily Short > Run workflow**. Check the result before trusting the schedule.

### YouTube token

1. Google Cloud Console: create a project, enable *YouTube Data API v3*.
2. Create an OAuth client (type *Desktop app*), add `http://localhost:53682` as a redirect URI.
3. Locally: `npm install`, then
   `YT_CLIENT_ID=... YT_CLIENT_SECRET=... node tools/get_youtube_token.mjs`
   Open the URL, approve, copy the printed `YT_REFRESH_TOKEN` into the repo secrets.

## Camera language

The camera is a hyper-caffeinated invisible drone: it never sits still, rockets through Z instead of cutting, and points at exactly what the narration says.

- **Wide lenses** (16-24 mm; 85 mm only for the flat isometric cutaway) so close-ups look bulbous and claustrophobic. Lens maths is in `fovOf()` / `reach()` in `web/scene.js`.
- **Deep focus, zero motion blur:** there is no depth of field or blur anywhere, so the hazard, the reaction and the background stay sharp.
- **Hard linear keyframes** for every camera move (no ease-in or ease-out), with a 3-4 frame whip between shots.
- **Micro-shake:** 4-5 frames of high-frequency, low-amplitude jitter on the exact impact frame (frame-locked, so renders are deterministic).

| Shot | What it does |
|---|---|
| `wide` | eye-level medium, 24 mm, waist-up, static or ultra-slow push-in: someone doing something normal |
| `suspense` | creeping push-in with a Dutch tilt toward the hazard |
| `hazard_ecu` | 18 mm extreme close-up (object fills ~70% of the frame) after a whip-pan down from the character |
| `impact_closeup` | tight on a mundane object, whip out to reveal the character beside it |
| `ots` | tight behind the ear looking down at the hands, slight handheld sway |
| `crash_zoom` | rockets forward through Z and stops millimetres from the eye |
| `xray` | rapid Z-axis dive through skin and clothes to a glowing skeleton part |
| `cutaway` | 45 degree isometric; the outer layer slices cleanly away (clipping plane) |
| `snorricam` | chest-mounted: body frozen centre-frame while the world spins; backward pull at the end |
| `worm_eye` | inches off the floor, tilted up past the hazard toward the looming face (`low_angle` is an alias) |
| `top_down` | God's eye, 90 degrees: walking toward a floor hazard, or the ragdoll aftermath with a slow pull-up |
| `projectile_pov` | missile cam riding just behind the flying object of the beat's `motion` |
| `panic_track` | handheld tracking in front of a running character's face |
| `whip_pan` | quick whips between a confused face and the strange object |
| `orbit` | 180 degree orbit freeze around hazard and victim, paired with a speed ramp |

The writer is told to follow your 15-second arc by default: wide, `hazard_ecu`, `ots`, `xray` or `cutaway`, `snorricam` or `worm_eye`, then `top_down` pulling up to reset the loop.

Extras: **speed ramp** (`ramp`: normal, ~10% speed at the moment of danger, catch-up; during an orbit the camera sweeps in real time while the action is near-frozen), **thrown or dropped objects** (`motion`) with impact-synced shake and ElevenLabs SFX, **glow highlights** (hazard or injured part glows red/orange/green while everything else desaturates), and a **seamless loop** (the last beat eases back to the opening frame).

## Things to know

- **Untested end to end.** The camera director and renderer have never been run (Three.js and Chromium were not available while writing them); only script validation, props, timeline and audio mixing were smoke-tested. It was written without network access, so the first manual run may need small fixes. Logs will show which step failed.
- **YouTube privacy:** uploads from unverified API projects are forced to *private*. After Google's audit passes, add a repo variable `YT_PRIVACY=public`.
- **Schedule drift:** GitHub cron can start 5-30+ minutes late at busy times. Scheduled runs pause if the repo has no activity for 60 days (the daily commit prevents that).
- **Actions minutes:** a render takes roughly 15-30 min. Public repos are free; private repos have 2,000 free min/month.
- **Disclosure:** YouTube asks creators to label realistic AI-generated or altered content. This stylised CGI with synthetic voice should be checked against their current policy.
- Videos go to Releases, not the repo, to avoid bloating git history.

## Tuning

- **Human-sounding text:** rules in `src/human.mjs` (`HUMAN_RULES` go into both prompts; `scrub()` swaps words like delve/crucial/moreover and removes em dashes). Narration is 5-14 words per line (most 8-12, at least two short ones) so the rhythm varies.
- **Places and sets:** `PLACES` in `src/blueprint.mjs` (anchor coordinates, wall/floor colours, furniture parts, allowed cameras). A camera name maps to a renderer shot in `shotFor()`.
- **Voice:** `TTS_VOICE`, `TTS_PITCH` (try -20Hz), `TTS_RATE` env vars, or the filter chain in `src/voice.mjs`.

- Weekday lanes (body, engineering failures, odd history, animals, everyday physics, food chemistry, geology/space): `THEMES` in `src/script.mjs`.
- Models: env vars `CLAUDE_MODEL`, `GROQ_MODEL`, `SCRIPT_PROVIDER=groq` to force Groq for scripts. Groq tries `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `openai/gpt-oss-20b`, `llama-3.1-8b-instant` in order and keeps the first one your key can use (orgs can block models, which gives a 404 model_not_found).
- ElevenLabs credits: at most 6 effects per video, each with an explicit 0.5-3 s duration.
- The mannequin cannot do cloth creasing or finger-level grips. Weight is shown through arm drag, lean and sag.

- Voice depth: `--pitch` and `bass=g=` in `.github/workflows/daily.yml` (try `-20Hz` for deeper).
- Poses and movement: `web/scene.js` (`POSES`, `stepped`, `STEP_TIME`).
- Topic style: the prompt in `src/script.mjs`.
