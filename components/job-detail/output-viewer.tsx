"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

interface OutputViewerProps {
  jobId: string;
}

type StreamState = "connecting" | "live" | "ended" | "error";

const LABEL: Record<StreamState, string> = {
  connecting: "Connecting…",
  live: "Live",
  ended: "Job finished",
  error: "Stopped",
};

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function OutputViewer({ jobId }: OutputViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<StreamState>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    // xterm touches `window`, so load it only in the browser.
    Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        convertEol: true, // job output uses \n; the terminal needs \r\n
        disableStdin: true,
        scrollback: 10000,
        fontSize: 12,
        cursorStyle: "bar",
        cursorInactiveStyle: "none",
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      const resize = new ResizeObserver(() => fit.fit());
      resize.observe(containerRef.current);

      const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/output/stream`);
      source.onopen = () => setState("live");
      source.addEventListener("chunk", (e) => {
        const { data, reset } = JSON.parse((e as MessageEvent).data);
        if (reset) term.reset();
        term.write(fromBase64(data)); // Uint8Array: xterm decodes UTF-8 across chunk boundaries
      });
      source.addEventListener("end", () => {
        source.close(); // otherwise EventSource reconnects
        setState("ended");
      });
      source.addEventListener("error", (e) => {
        const data = (e as MessageEvent).data;
        if (data) {
          // Server-sent error event: final, don't reconnect.
          source.close();
          setError(JSON.parse(data).message);
          setState("error");
        } else if (source.readyState === EventSource.CLOSED) {
          setError("Output is not available (no output file, or the connection was lost).");
          setState("error");
        } else {
          setState("connecting"); // network blip: the browser retries with Last-Event-ID
        }
      });

      cleanup = () => {
        source.close();
        resize.disconnect();
        term.dispose();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [jobId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Output</CardTitle>
        <span className="text-xs text-muted-foreground" aria-live="polite">{LABEL[state]}</span>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive mb-2">{error}</p>}
        <div ref={containerRef} className="h-[400px] rounded-md overflow-hidden bg-black p-2" />
      </CardContent>
    </Card>
  );
}
