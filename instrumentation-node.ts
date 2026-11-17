// Node.js-only startup checks, loaded from instrumentation.ts.
// Refuses to boot a production server with an insecure configuration.
import { config } from "@/lib/config";
import { log } from "@/lib/log";

export function checkStartupConfig(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) {
    // Throwing here only logs an unhandled rejection; exit so the service
    // manager reports the failure instead of serving with a guessable secret.
    console.error(
      "FATAL: NEXTAUTH_SECRET must be set to a random string of at least 32 characters " +
        "(e.g. `openssl rand -base64 48`). See docs/INSTALL.md."
    );
    process.exit(1);
  }

  if (!config.mainConfig.use_pam) {
    log.warn(
      "use_pam is disabled: ANY password is accepted for any existing OS user. " +
        "Never run like this on a shared system."
    );
  }
}
