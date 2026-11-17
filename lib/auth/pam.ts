/**
 * PAM authentication wrapper.
 * When use_pam=true (production): verifies credentials against the system PAM stack.
 * When use_pam=false (dev mode): skips password check — accepts any valid OS user.
 */

import { getent } from "@/lib/os";
import type { SystemUser } from "@/lib/db/models/user";
import { config } from "@/lib/config";

export async function pamAuthenticate(
  username: string,
  password: string
): Promise<boolean> {
  if (!config.mainConfig.use_pam) {
    // Dev mode: just confirm the OS user exists; skip password
    try {
      getent(username);
      return true;
    } catch {
      return false;
    }
  }

  const pam = await import("authenticate-pam");
  const serviceName: string = config.mainConfig.pam_module || "login";

  return new Promise((resolve) => {
    pam.authenticate(
      username,
      password,
      (err: Error | undefined) => resolve(!err),
      { serviceName }
    );
  });
}

export function getSystemUser(username: string): SystemUser {
  const entry = getent(username);
  return {
    username: entry.username,
    uid: Number(entry.uid ?? 0),
    gid: Number(entry.gid ?? 0),
    home: entry.home ?? `/home/${username}`,
    shell: entry.shell ?? "/bin/sh",
  };
}
