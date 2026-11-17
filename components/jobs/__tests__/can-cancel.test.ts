import { describe, expect, it } from "vitest";
import { canCancel } from "../can-cancel";

const alice = { username: "alice", isAdmin: false };
const admin = { username: "root", isAdmin: true };

describe("canCancel", () => {
  it("allows the owner while the job is in the queue", () => {
    expect(canCancel({ username: "alice", status: "Running" }, alice)).toBe(true);
    expect(canCancel({ username: "alice", status: "Queued" }, alice)).toBe(true);
    expect(canCancel({ username: "alice", status: "Held" }, alice)).toBe(true);
  });

  it("hides Cancel on another user's job unless the user is an admin", () => {
    expect(canCancel({ username: "bob", status: "Running" }, alice)).toBe(false);
    expect(canCancel({ username: "bob", status: "Running" }, admin)).toBe(true);
  });

  it("hides Cancel once the job has left the queue", () => {
    for (const status of ["Completed", "Exiting", "Failed", "Archive", "Unknown", undefined]) {
      expect(canCancel({ username: "alice", status }, alice)).toBe(false);
      expect(canCancel({ username: "alice", status }, admin)).toBe(false);
    }
  });

  it("hides Cancel without a job or a session", () => {
    expect(canCancel(undefined, alice)).toBe(false);
    expect(canCancel({ username: "alice", status: "Running" }, undefined)).toBe(false);
    expect(canCancel({ status: "Running" }, { username: null })).toBe(false);
  });
});
