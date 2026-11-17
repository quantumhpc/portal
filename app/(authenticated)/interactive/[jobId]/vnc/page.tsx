"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type RFB from "@novnc/novnc";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Clipboard, Expand, Keyboard, Loader2, RefreshCw } from "lucide-react";

type Session = { ready: true; url: string; password: string } | { ready: false; reason: string };
type State = { kind: "waiting"; reason: string } | { kind: "connecting" } | { kind: "connected" } | { kind: "closed"; reason: string };

/** Absolute ws(s):// URL; relative paths go to this origin (the reverse proxy routes them). */
function toWsUrl(url: string): string {
  if (/^wss?:\/\//.test(url)) return url;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default function VncPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const screenRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [state, setState] = useState<State>({ kind: "waiting", reason: "Looking up the session…" });
  const [attempt, setAttempt] = useState(0);
  const [desktopName, setDesktopName] = useState("");
  const [remoteClip, setRemoteClip] = useState("");
  const [localClip, setLocalClip] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async (session: Extract<Session, { ready: true }>) => {
      const { default: RFBClass } = await import("@novnc/novnc");
      if (cancelled || !screenRef.current) return;
      setState({ kind: "connecting" });
      const rfb = new RFBClass(screenRef.current, toWsUrl(session.url), { credentials: { password: session.password } });
      rfb.scaleViewport = true;
      rfb.resizeSession = true;
      rfb.background = "#111";
      rfb.addEventListener("connect", () => {
        setState({ kind: "connected" });
        rfb.focus();
      });
      // Sent during the handshake, before "connect".
      rfb.addEventListener("desktopname", (e) => setDesktopName((e as CustomEvent).detail.name));
      rfb.addEventListener("clipboard", (e) => setRemoteClip((e as CustomEvent).detail.text));
      rfb.addEventListener("securityfailure", (e) =>
        setState({ kind: "closed", reason: `Authentication failed: ${(e as CustomEvent).detail.reason || "wrong password"}` })
      );
      rfb.addEventListener("disconnect", (e) =>
        setState((s) => (s.kind === "closed" ? s : { kind: "closed", reason: (e as CustomEvent).detail.clean ? "Disconnected." : "Connection lost." }))
      );
      rfbRef.current = rfb;
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/vnc/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) return setState({ kind: "closed", reason: body.error || "Session not available." });
        if (body.ready) return connect(body);
        setState({ kind: "waiting", reason: body.reason });
        if (body.reason !== "The session has ended.") timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 5000);
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      rfbRef.current?.disconnect();
      rfbRef.current = null;
    };
  }, [jobId, attempt]);

  const fullscreen = useCallback(() => {
    frameRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const connected = state.kind === "connected";
  const label =
    state.kind === "waiting" ? state.reason
      : state.kind === "connecting" ? "Connecting…"
        : state.kind === "connected" ? `Connected${desktopName ? ` to ${desktopName}` : ""}`
          : state.reason;

  return (
    <div className="flex h-full min-h-[70vh] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href="/interactive">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> Sessions
            </Button>
          </Link>
          <h2 className="text-lg font-semibold">Remote desktop · job {jobId}</h2>
          <span className="flex items-center gap-1 text-sm text-muted-foreground" aria-live="polite">
            {(state.kind === "waiting" || state.kind === "connecting") && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {label}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={!connected}>
                <Clipboard className="mr-1 h-4 w-4" /> Clipboard
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-2">
              <label className="text-sm font-medium" htmlFor="vnc-clip">Send text to the desktop</label>
              <textarea
                id="vnc-clip"
                className="h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
                value={localClip}
                onChange={(e) => setLocalClip(e.target.value)}
              />
              <Button size="sm" onClick={() => rfbRef.current?.clipboardPasteFrom(localClip)}>Send</Button>
              {remoteClip && (
                <>
                  <p className="text-sm font-medium">Copied on the desktop</p>
                  <pre className="max-h-24 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{remoteClip}</pre>
                </>
              )}
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" disabled={!connected} onClick={() => rfbRef.current?.sendCtrlAltDel()}>
            <Keyboard className="mr-1 h-4 w-4" /> Ctrl+Alt+Del
          </Button>
          <Button variant="outline" size="sm" disabled={!connected} onClick={fullscreen}>
            <Expand className="mr-1 h-4 w-4" /> Fullscreen
          </Button>
          {state.kind === "closed" && (
            <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw className="mr-1 h-4 w-4" /> Reconnect
            </Button>
          )}
        </div>
      </div>
      <div ref={frameRef} className="relative flex-1 overflow-hidden rounded-md bg-[#111]">
        <div ref={screenRef} className="absolute inset-0" data-testid="vnc-screen" />
      </div>
    </div>
  );
}
