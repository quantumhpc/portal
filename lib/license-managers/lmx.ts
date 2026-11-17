/**
 * LM-X License Manager
 * Parses lmxstat output to get license pool status.
 * Ported from api/lmxjs/lmxjs.js
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { LicConfig } from './flexlm';

const featureRegEx = /^\s*Feature\:\s*([^\s]+)\s*Version\:\s*([0-9]+\.[0-9]+)\s*Vendor\:\s*([^\s]+)$/;
const dateRegEx = /^\s*Start\sdate\:\s*([0-9]{4}\-[0-9]{2}\-[0-9]{2})\s*Expire\sdate\:\s*([0-9]{4}\-[0-9]{2}\-[0-9]{2})/;
const keyRegEx = /^\s*Key\stype\:\s*([^\s]+)\s*License\ssharing\:\s*(.+)/;
const totalRegEx = /^\s*([0-9]+)\sof\s([0-9]+)\slicense\(s\)\sused/;
const denialRegEx = /^\s*([0-9]+)\sdenial\(s\)\sin\slast\s[0-9]+\shours/;
const userTokenRegEx = /\s*([0-9]+)\slicense\(s\)\sused\sby\s(.+?)@([^\s]+)\s+\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\]/;
const userTokenTimeRegEx = /\s*Login\stime\:\s*([0-9]{4}\-[0-9]{2}\-[0-9]{2})\s+([0-9]{2}\:[0-9]{2})\s+Checkout\stime\:\s*([0-9]{4}\-[0-9]{2}\-[0-9]{2})\s+([0-9]{2}\:[0-9]{2})/;

export function lmxstat(config: LicConfig): Record<string, any> {
  const result: Record<string, any> = {};
  let tokenFeature = '';
  const cmdArgs = config.cmd.trim().split(/\s/g);

  let lines: string[];

  if (Array.isArray(config.serverURL) && config.serverURL[0] === 'test') {
    lines = fs.readFileSync(config.serverURL[1], 'utf8').split(os.EOL);
  } else {
    const url = (config.serverURL as string).split('@');
    cmdArgs.push('-host', url[1], '-port', url[0]);
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
      const dateLine = lines[i + 1];
      const keyLine = lines[i + 2];
      const totalLine = lines[i + 4];
      const n = dateLine?.match(dateRegEx);
      const o = keyLine?.match(keyRegEx);
      const p = totalLine?.match(totalRegEx);
      if (n && o && p) {
        result[tokenFeature] = {
          total: Number(p[2]), used: Number(p[1]), free: Number(p[2]) - Number(p[1]),
          version: m[2], vendor: m[3], type: o[1], sharing: o[2],
          start: n[1], expiry: n[2], tokens: [],
        };
        i += 4;
      }
    } else {
      const q = line.match(denialRegEx);
      if (q && result[tokenFeature]) {
        result[tokenFeature].denial = Number(q[1]);
      } else {
        const r = line.match(userTokenRegEx);
        if (r && result[tokenFeature]) {
          const tokenTimeLine = lines[i + 1];
          const s = tokenTimeLine?.match(userTokenTimeRegEx);
          if (s) {
            result[tokenFeature].tokens.push({
              username: r[2], machine: r[3],
              started: s[1] + ' at ' + s[2], tokens: r[1],
            });
            // user entry spans 2 lines (user + login/checkout); the for-loop
            // advances 1 more, so skip just the login line here.
            i += 1;
          }
        }
      }
    }
  }

  return result;
}
