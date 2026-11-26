// Reference check step (runs after the plan is built, before the full render):
//   1. the video must contain the objects and characters the script lists, and 2. they must do the actions the script lists.
// Failures are repaired automatically (up to 3 rounds); whatever still fails is reported in work/qa.json and the log.
// QA_STRICT=1 makes the workflow fail if something is still wrong after repairs.
import fs from 'node:fs';
import { openStage } from './stage.mjs';
import { sampleTimes, evaluate, repair } from './qa_core.mjs';

const plan = JSON.parse(fs.readFileSync('work/plan.json', 'utf8'));
const MAX_ROUNDS = 3;
const report = { rounds: [], remaining: [] };
let todo = plan.beats.map((_, i) => i);

for (let round = 1; round <= MAX_ROUNDS + 1; round++) {
  const stage = await openStage(plan);
  const failures = [];
  for (const i of todo) {
    const beat = plan.beats[i];
    const samples = [];
    for (const t of sampleTimes(beat)) samples.push({ t, p: await stage.probe(t) });
    failures.push(...evaluate(beat, samples, i));
  }
  await stage.close();

  const actionable = failures.filter((f) => f.kind !== 'unsupported');
  report.rounds.push({ round, checkedScenes: todo.map((i) => i + 1), failures });
  console.log(`QA round ${round}: ${todo.length} scenes checked, ${actionable.length} problems${actionable.length ? '' : ' - all objects present and all actions performed'}`);
  for (const f of failures) console.log(`  - ${f.detail}`);

  report.remaining = failures;
  if (!actionable.length || round > MAX_ROUNDS) break;
  const changes = repair(plan, actionable, round);
  for (const c of changes) console.log(`  repaired ${c}`);
  report.rounds[report.rounds.length - 1].repairs = changes;
  fs.writeFileSync('work/plan.json', JSON.stringify(plan, null, 2));
  todo = [...new Set(actionable.map((f) => f.beat))];
}

fs.writeFileSync('work/qa.json', JSON.stringify(report, null, 2));
const left = report.remaining.filter((f) => f.kind !== 'unsupported');
console.log(left.length ? `QA finished with ${left.length} unresolved problem(s), see work/qa.json` : 'QA passed');
if (left.length && process.env.QA_STRICT === '1') process.exit(1);
