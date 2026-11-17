import { describe, expect, it } from "vitest";
import { licenseBarColor, ownJobs } from "../panel-rules";

describe("ownJobs", () => {
  const rows = [
    { jobId: "1", username: "alice" },
    { jobId: "2", username: "bob" },
    { jobId: "3", username: "alice" },
  ];

  it("keeps only the session user's rows", () => {
    expect(ownJobs(rows, "alice").map((r) => r.jobId)).toEqual(["1", "3"]);
  });

  it("returns nothing without a user or data", () => {
    expect(ownJobs(rows, undefined)).toEqual([]);
    expect(ownJobs(undefined, "alice")).toEqual([]);
  });
});

describe("licenseBarColor", () => {
  it("uses the primary colour below 80%", () => {
    expect(licenseBarColor(0)).toBe("bg-primary");
    expect(licenseBarColor(79.9)).toBe("bg-primary");
  });

  it("warns from 80% and alarms from 95%", () => {
    expect(licenseBarColor(80)).toBe("bg-warning");
    expect(licenseBarColor(94.9)).toBe("bg-warning");
    expect(licenseBarColor(95)).toBe("bg-destructive");
    expect(licenseBarColor(100)).toBe("bg-destructive");
  });
});
