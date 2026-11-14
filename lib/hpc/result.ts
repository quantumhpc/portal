/**
 * Typed result wrapper for HPC operations.
 * Lets API routes distinguish error categories and surface scheduler stderr
 * to admins only without leaking it to regular users.
 */

export type AppErrorCode =
  | "HPC_EXEC_FAILED"   // scheduler binary returned non-zero / threw
  | "HPC_STDERR"        // binary exited OK but stderr is non-empty
  | "HPC_NOT_FOUND"     // job/node/queue not found
  | "CONFIG_INVALID"    // missing or malformed config
  | "AUTH_FAILED";      // session or permission error

export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Raw scheduler stderr — show to admins only. */
  detail?: string;
  /** Suggested HTTP status code. */
  status?: number;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: AppError): Result<never> {
  return { ok: false, error };
}

/** Wrap an async call, converting thrown errors into Result failures. */
export async function wrap<T>(
  fn: () => Promise<T>,
  code: AppErrorCode = "HPC_EXEC_FAILED"
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e: any) {
    const message: string = e?.message ?? String(e);
    const detail: string | undefined = e?.stderr ?? e?.detail ?? undefined;
    return err({ code, message, detail, status: 500 });
  }
}
