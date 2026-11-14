/** Statuses of a job that is still in the scheduler queue. */
const LIVE = new Set([
  "Queued", "Running", "Held", "Waiting", "Suspended", "User-Suspended", "Configuring", "Moving",
]);

/**
 * Whether the UI offers Cancel for a job: it is still in the queue, and the
 * session user owns it or is an admin. This only hides the button. The
 * scheduler runs the cancel as the user and is the real access control.
 */
export function canCancel(
  job: { username?: string; status?: string } | undefined,
  user: { username?: string | null; isAdmin?: boolean } | undefined,
): boolean {
  if (!job?.status || !LIVE.has(job.status) || !user) return false;
  return !!user.isAdmin || (!!user.username && job.username === user.username);
}
