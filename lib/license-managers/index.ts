/**
 * License Manager Unified Interface
 * Routes to the correct license manager (FlexLM, RLM, LM-X) based on config.
 * Ported from libs/lmlib.js
 */

import { getConfig } from '@/lib/config';
import { lmstat as flexLmstat, type LicConfig } from './flexlm';
import { rlmstat } from './rlm';
import { lmxstat } from './lmx';

function parseLmstat(licPool: Record<string, any>): Record<string, any> {
  for (const lic in licPool) {
    if (licPool[lic].total) {
      licPool[lic].freePerc = Math.floor((licPool[lic].total - licPool[lic].used) / licPool[lic].total * 100);
      licPool[lic].progressType = getProgressType(licPool[lic].freePerc);
    }
  }
  return licPool;
}

function getProgressType(perc: number): string {
  if (perc <= 33) return 'danger';
  if (perc <= 66) return 'warning';
  return 'info';
}

export function lmstat(lmConfig: { type: string; url: string }): Record<string, any> {
  const config = getConfig();
  const typeConfig = config.licConfig[lmConfig.type];
  if (!typeConfig) throw new Error(`License manager type '${lmConfig.type}' not configured`);

  const licConfig: LicConfig = {
    serverURL: lmConfig.url,
    binary: typeConfig.binary,
    cmd: typeConfig.cmd,
  };

  let data: Record<string, any>;

  switch (lmConfig.type) {
    case 'flexlm':
      data = flexLmstat(licConfig);
      break;
    case 'rlm':
      data = rlmstat(licConfig);
      break;
    case 'lmx':
      data = lmxstat(licConfig);
      break;
    default:
      throw new Error(`Unknown license manager type: ${lmConfig.type}`);
  }

  return parseLmstat(data);
}

/** Get all configured license servers */
export function getLicServers(): Record<string, any> {
  return getConfig().mainConfig.lic_servers || {};
}
