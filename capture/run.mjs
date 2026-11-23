// `npm run capture [-- --rewind <checkout>]`: runs capture.py with that checkout's own venv (Windows or POSIX layout).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const i = args.indexOf('--rewind');
const rewind = resolve(i >= 0 ? args[i + 1] : '../rewind');
const python = [join(rewind, '.venv', 'Scripts', 'python.exe'), join(rewind, '.venv', 'bin', 'python')].find(existsSync);
if (!python) {
  console.error(`capture: no venv in ${rewind} (python -m venv .venv && pip install -e ".[dev]")`);
  process.exit(1);
}
const rest = i >= 0 ? [...args.slice(0, i), ...args.slice(i + 2)] : args;
const r = spawnSync(python, ['capture/capture.py', '--rewind', rewind, '--out', 'src/data/capture', ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
