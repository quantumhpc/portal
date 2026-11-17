/**
 * HPC Config Helper
 * Merges the global HPC manager config with the current user's system identity.
 * uid/gid/username/home come from the PAM-resolved SystemUser in the session.
 */

import { getConfig } from "@/lib/config";
import type { AuthenticatedUser } from "@/lib/db/models/user";
import type { HpcConfig } from "@/lib/hpc/exec";
import fs from "fs";

export function getHpcUserConfig(user: AuthenticatedUser): HpcConfig {
  const { hpcGlobalConfig } = getConfig();

  const merged = {
    ...hpcGlobalConfig,
    username: user.system.username,
    uid: user.system.uid,
    gid: user.system.gid,
    home: user.system.home,
    method: hpcGlobalConfig.method || "local",
  } as HpcConfig;

  if (merged.method === "ssh" && merged.secretAccessKey) {
    if (!fs.existsSync(merged.secretAccessKey)) {
      throw new Error("SSH Key not present");
    }
  }

  return merged;
}
