/** Queue rows owned by `username`. No user, no rows. */
export function ownJobs<T extends { username?: string }>(jobs: T[] | undefined, username: string | undefined): T[] {
  return username ? (jobs ?? []).filter((j) => j.username === username) : [];
}

/** Licence bar colour: warn from 80% used, alarm from 95%. */
export function licenseBarColor(usedPerc: number): string {
  if (usedPerc >= 95) return "bg-destructive";
  if (usedPerc >= 80) return "bg-warning";
  return "bg-primary";
}
