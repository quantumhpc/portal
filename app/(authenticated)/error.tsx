"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorBoundary({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
