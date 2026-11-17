"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Application logo, or a generic icon when there is none or it fails to load. */
export function AppIcon({ logo, size = 24, className }: { logo?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) {
    return <Package className={cn("text-muted-foreground shrink-0", className)} style={{ width: size, height: size }} aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logos are small, site-provided files
    <img src={logo} alt="" width={size} height={size} className={cn("object-contain shrink-0", className)} onError={() => setFailed(true)} />
  );
}
