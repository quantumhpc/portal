/**
 * FlexLM License Manager
 * Parses lmstat output to get license pool status.
 * Ported from api/flexlmjs/flexjs.js
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const featureRegEx = /^Users of ([^:]*):[^0-9:]*([0-9]+)[^0-9]*([0-9]+)[^0-9]*([\)]+)/;
const errorRegEx = /^Users of ([^:]*):[^0-9]*(Error)[^0-9]*([0-9]+)[^0-9]*,([^:]*)([\)]+)/;
const versionTokenRegEx = /\s*([^\s]*)\s+([^\s,]*),\s+([^\s]*)\s+([^\s,]*),\s+([^\s]*)\s+([^\s,]*)/;
const userTokenRegEx = /\s*([^\s]*)\s+([^\s]*)\s+([^\s]*)\s+([^\s]*){0,1}\s*\(([^\s]*)\)\s+\(([^\)]*)\),\s+([^\s]*)\s(.*)/;

export interface LicConfig {
  serverURL: string | string[];
  binary: string;
  cmd: string;
}

export function lmstat(config: LicConfig): Record<string, any> {
  const result: Record<string, any> = {};
  let tokenFeature = '';
  let vendorInfo: any = {};
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
      result[tokenFeature] = {
        total: Number(m[2]),
        used: Number(m[3]),
        free: Number(m[2]) - Number(m[3]),
        tokens: [],
      };
    } else {
      const n = line.match(versionTokenRegEx);
      if (n) {
        vendorInfo = { name: n[4], version: n[2], expiry: n[6] };
      } else {
        const u = line.match(userTokenRegEx);
        if (u) {
          result[tokenFeature]?.tokens.push({
            username: u[1], machine: u[2], started: u[8],
            vendorname: vendorInfo.name, version: vendorInfo.version, expiry: vendorInfo.expiry,
          });
        } else {
          const e = line.match(errorRegEx);
          if (e) {
            result[e[1]] = { total: Number(e[3]), error: e[4] };
          }
        }
      }
    }
  }

  return result;
}
