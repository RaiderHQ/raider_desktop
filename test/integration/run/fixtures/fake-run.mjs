// Stands in for rspec/cucumber in runner tests, so no Ruby is needed.
// FAKE_SCRIPT (JSON):
//   steps: [{ delay?, event?, worker?, stdout?, stderr?, runJson? }]
//     event   - an object (JSON-encoded) or a raw string, appended to $RAIDER_EVENTS_DIR/worker-<worker|1>.ndjson
//     runJson - result statuses written to ./raider-results/run.json with finished_at = now
//   exitCode     - exit code after the last step (default 0)
//   hang         - stay alive after the steps until signalled
//   ignoreSigint - ignore SIGINT (so only SIGKILL stops it)
import fs from 'node:fs'
import path from 'node:path'

const script = JSON.parse(process.env.FAKE_SCRIPT || '{}')
const eventsDir = process.env.RAIDER_EVENTS_DIR

process.on('SIGINT', () => {
  // Exit only once the marker is flushed: pipe writes are async on macOS
  process.stdout.write('fake: got SIGINT\n', () => {
    if (!script.ignoreSigint) process.exit(130)
  })
})

for (const step of script.steps || []) {
  if (step.delay) await new Promise((resolve) => setTimeout(resolve, step.delay))
  if (step.event !== undefined) {
    const line = typeof step.event === 'string' ? step.event : JSON.stringify(step.event)
    fs.appendFileSync(path.join(eventsDir, `worker-${step.worker || 1}.ndjson`), `${line}\n`)
  }
  if (step.stdout) process.stdout.write(step.stdout)
  if (step.stderr) process.stderr.write(step.stderr)
  if (step.runJson) {
    fs.mkdirSync('raider-results', { recursive: true })
    const results = step.runJson.map((status, i) => ({ full_name: `test ${i}`, status }))
    fs.writeFileSync(
      path.join('raider-results', 'run.json'),
      JSON.stringify({ run: { finished_at: new Date().toISOString() }, results })
    )
  }
}

if (script.hang) setInterval(() => {}, 1000)
// Let the loop drain instead of process.exit, so buffered output isn't lost
else process.exitCode = script.exitCode ?? 0
