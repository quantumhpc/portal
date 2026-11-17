import { z } from "zod";

/**
 * Zod schema for HpcConfig JSON files (slurm_config.json, pbs_config.json, etc.).
 * Validated at load time in lib/config.ts so bad configs fail fast with a
 * readable message rather than causing a cryptic runtime error later.
 *
 * Fields set at runtime (username, uid, gid from the authenticated user) are
 * optional here — they are merged in by lib/auth/hpc-config.ts.
 *
 * Unknown keys (e.g. "userParams", "priority") are passed through so the
 * manager layer can access scheduler-specific extensions.
 */
export const HpcConfigSchema = z
  .object({
    method:          z.enum(["ssh", "local"]).default("local"),
    sshExec:         z.string().default("/usr/bin/ssh"),
    defaultOpts:     z.string().default(""),
    scpExec:         z.string().default("/usr/bin/scp"),
    serverName:      z.string().default("localhost"),
    secretAccessKey: z.string().default(""),
    localShell:      z.string().default("/bin/sh"),
    localCopy:       z.string().default("/bin/cp"),
    useSharedDir:    z.boolean().default(false),
    sharedDir:       z.string().default(""),
    workingDir:      z.string().default("/tmp"),
    binariesDir:     z.string().min(1, "binariesDir is required"),
    permissions:     z.string().optional(),
    limit:           z.number().optional(),
    useAlternate:    z.boolean().optional(),
    // Runtime-merged fields (optional at file-load time)
    username:        z.string().optional(),
    uid:             z.number().optional(),
    gid:             z.number().optional(),
  })
  .passthrough(); // keep extension fields (userParams, priority, etc.)

export type HpcConfigInput = z.input<typeof HpcConfigSchema>;
export type HpcConfigParsed = z.output<typeof HpcConfigSchema>;
