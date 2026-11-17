/**
 * OS Utilities
 * System user operations for admin panel.
 * Ported from libs/oslibs.js (Linux only)
 */

import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

export interface OsUser {
  username: string;
  uid?: string;
  gid?: string;
  home?: string;
  shell?: string;
}

function readPasswd(entry: string): OsUser {
  const parts = entry.split(':');
  return {
    username: parts[0],
    uid: parts[2],
    gid: parts[3],
    home: parts[5],
    shell: parts[6],
  };
}

/** List all OS users from /etc/passwd */
export function osUsers(): OsUser[] {
  const stdout = execSync('cat /etc/passwd', { encoding: 'utf8' });
  const lines = stdout.trim().split(os.EOL);
  return lines.map(readPasswd);
}

/** Get a specific user's info via getent */
export function getent(username: string): OsUser {
  const stdout = execSync(`getent passwd ${username}`, { encoding: 'utf8' });
  return readPasswd(stdout.trim());
}

/** Resolve a local path to its remote NFS mount path */
export function resolveMounted(resolveFolder: string): { mountedPath: string; remotePath: string; remoteIp: string } | null {
  try {
    const stdout = execSync('df -P -T', { encoding: 'utf8' });
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.split(/\s+/g);
      const mountPoint = parts[6]?.trim();
      if (mountPoint && mountPoint !== '/' && resolveFolder.includes(mountPoint)) {
        const subDir = path.relative(mountPoint, resolveFolder);
        const remoteParts = parts[0].trim().split(':');
        return {
          mountedPath: resolveFolder,
          remotePath: path.join(remoteParts[1], subDir),
          remoteIp: remoteParts[0],
        };
      }
    }
  } catch {}
  return null;
}
