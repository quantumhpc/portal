/**
 * The text up to and including its last newline.
 *
 * A running solver may be in the middle of writing a line. Parsed as is, a
 * half-written line ("Initial residual = 1.2") plots a wrong point until the
 * next poll. Dropping it here means the line is read whole on the next poll.
 * shortcut: a file whose very last line has no newline never shows that line;
 * pass the full text once the job has finished if a solver needs it.
 */
export function completeLines(text: string): string {
  return text.slice(0, text.lastIndexOf('\n') + 1);
}
