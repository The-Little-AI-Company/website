import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pnpmPinError } from './scripts/check-pnpm-version.mjs';

const root = realpathSync(process.argv[2]);
if (root !== '/github/runner_temp/work') throw new Error('Unreviewed manager working directory.');
const pinError = pnpmPinError(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
if (pinError) throw new Error(pinError);
const digest = createHash('sha256').update(readFileSync(join(root, 'pnpm-workspace.yaml'))).digest('hex');
if (digest !== '3e4be68bf3deb65e33f1276e75c2970f0301b39fb844db5c1a05b08037591384') throw new Error('Workspace configuration changed outside the reviewed manager-input boundary.');
for (const directory of [root, '/github/runner_temp']) {
  for (const filename of ['.npmrc', '.pnpmfile.cjs', 'pnpmfile.cjs']) {
    if (existsSync(join(directory, filename))) throw new Error('Unreviewed project or parent manager configuration.');
  }
}
