import { describe, it, expect } from "vitest";
import { userEnv } from "../exec";

describe("userEnv", () => {
  const base = {
    PATH: "/usr/bin:/bin",
    HOME: "/root",
    USER: "root",
    SLURM_CONF: "/etc/slurm/slurm.conf",
    NEXTAUTH_SECRET: "s3cr3t",
    MONGODB_PASSWORD: "pw",
    GITHUB_TOKEN: "tok",
    AWS_SECRET_ACCESS_KEY: "aws",
    OPENAI_API_KEY: "k",
  };

  it("never forwards portal secrets to user processes", () => {
    const env = userEnv({ username: "alice", home: "/home/alice" }, base);
    for (const k of ["NEXTAUTH_SECRET", "MONGODB_PASSWORD", "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "OPENAI_API_KEY"]) {
      expect(env).not.toHaveProperty(k);
    }
  });

  it("keeps ordinary variables and switches identity to the user", () => {
    const env = userEnv({ username: "alice", home: "/home/alice" }, base);
    expect(env.PATH).toBe("/usr/bin:/bin");
    expect(env.SLURM_CONF).toBe("/etc/slurm/slurm.conf");
    expect(env.HOME).toBe("/home/alice");
    expect(env.USER).toBe("alice");
    expect(env.LOGNAME).toBe("alice");
  });
});
