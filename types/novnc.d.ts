// Minimal types for the parts of noVNC (@novnc/novnc, core/rfb.js) the portal uses.
declare module "@novnc/novnc" {
  export interface RFBOptions {
    credentials?: { username?: string; password?: string; target?: string };
    shared?: boolean;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: RFBOptions);
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    viewOnly: boolean;
    focusOnClick: boolean;
    background: string;
    disconnect(): void;
    sendCredentials(credentials: { password: string }): void;
    sendCtrlAltDel(): void;
    clipboardPasteFrom(text: string): void;
    focus(): void;
  }
}
