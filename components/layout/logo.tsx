import { cn } from "@/lib/utils";

/* eslint-disable @next/next/no-img-element -- static SVGs: next/image adds nothing here */

/** The portal mark; swaps to the white version in dark mode. Decorative unless `label` is set. */
export function LogoIcon({ className, label }: { className?: string; label?: string }) {
  const alt = label ?? "";
  return (
    <>
      <img src="/logos/icon-light.svg" alt={alt} aria-hidden={!label || undefined} className={cn("dark:hidden", className)} />
      <img src="/logos/icon-dark.svg" alt={alt} aria-hidden={!label || undefined} className={cn("hidden dark:block", className)} />
    </>
  );
}

/** Mark + "QuantumHPC Portal" wordmark. */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <>
      <img src="/logos/lockup-light.svg" alt="QuantumHPC Portal" className={cn("dark:hidden", className)} />
      <img src="/logos/lockup-dark.svg" alt="QuantumHPC Portal" className={cn("hidden dark:block", className)} />
    </>
  );
}
