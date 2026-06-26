// Healthcheck du conteneur bot.
// Sort 0 (sain) si le heartbeat ecrit par le process date de moins de
// HEALTHCHECK_MAX_AGE_MS (def. 90 s) ; sort 1 sinon (Docker redemarrera).
import { readFile } from 'node:fs/promises';

const FILE = process.env.HEALTHCHECK_FILE ?? '/tmp/hotzdoggz-heartbeat';
const MAX_AGE_MS = Number(process.env.HEALTHCHECK_MAX_AGE_MS ?? 90_000);

try {
  const ts = Number((await readFile(FILE, 'utf8')).trim());
  const age = Date.now() - ts;
  if (!Number.isFinite(ts) || age > MAX_AGE_MS) {
    console.error(`Heartbeat perime (age=${age} ms > ${MAX_AGE_MS} ms)`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`Heartbeat illisible (${FILE}) : ${err.message}`);
  process.exit(1);
}
