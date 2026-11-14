/**
 * RLM License Manager
 * Parses rlmstat output to get license pool status.
 * Ported from api/rlmjs/rlmjs.js
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { LicConfig } from './flexlm';

const featureRegEx = /^\s+([^:]+)\s(v[0-9]+\.[0-9]+)$/;
const countRegEx = /^\s+count\:\s*([0-9]+),\s*\#\s*reservations\:\s*([0-9]+),\s*inuse\:\s*([0-9]+),\s*exp\:\s*([a-z]+)/;
const totalRegEx = /^\s+obsolete\:\s*([0-9]+),\s*min_remove\:\s*([0-9]+),\s*total\scheckouts\:\s*([0-9]+)/;
const userTokenRegEx = /\s+([^:]+)\s(v[0-9]+\.[0-9]+)\:\s*(.+?)@([^\s]*)\s+([0-9]+)\/([0-9]+)\sat\s([0-9]+\/[0-9]+)\s([0-9]+:[0-9]+)/;

export function rlmstat(config: LicConfig): Record<string, any> {
  const result: Record<string, any> = {};
  let tokenFeature = '';
  const cmdArgs = config.cmd.trim().split(/\s/g);

  let lines: string[];

  if (Array.isArray(config.serverURL) && config.serverURL[0] === 'test') {
    lines = fs.readFileSync(config.serverURL[1], 'utf8').split(os.EOL);
  } else {
    cmdArgs.push(config.serverURL as string);
    const binary = path.resolve(config.binary + (process.platform === 'win32' && !config.binary.endsWith('.exe') ? '.exe' : ''));
    const output = spawnSync(binary, cmdArgs, { encoding: 'utf8' });
    if (output.error) throw new Error(String(output.error));
    if (output.stderr) throw new Error(output.stderr.replace(new RegExp(os.EOL, 'g'), ''));
    lines = output.stdout.split(os.EOL);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(featureRegEx);
    if (m) {
      tokenFeature = m[1];
      const countLine = lines[i + 1];
      const totalLine = lines[i + 2];
      const n = countLine?.match(countRegEx);
      const o = totalLine?.match(totalRegEx);
      if (n && o) {
        result[tokenFeature] = {
          total: Number(n[1]), reservations: Number(n[2]),
          used: Number(n[3]), free: Number(n[1]) - Number(n[3]),
          version: m[2], obsolete: Number(o[1]),
          min_remove: Number(o[2]), checkouts: Number(o[3]),
          tokens: [],
        };
        i += 2;
      }
    } else {
      const p = line.match(userTokenRegEx);
      if (p && result[p[1]]) {
        result[p[1]].tokens.push({
          username: p[3], machine: p[4],
          started: p[7] + ' at ' + p[8],
          version: p[2], tokens: p[5],
        });
      }
    }
  }

  return result;
}
