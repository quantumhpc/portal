/** Job statuses (as normalised by the formatter or stored by the portal) after which nothing more happens. */
export const TERMINAL_STATUSES = new Set([
  'Completed', 'Failed', 'Timeout', 'NodeFail', 'Cancelled', 'Canceled', // Slurm, formatter
  'Finished', 'Expired', 'Moved',                                      // PBS
  'Archive',                                                           // portal
]);

export const isTerminal = (status: unknown) => TERMINAL_STATUSES.has(String(status));
