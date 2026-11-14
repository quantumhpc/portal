import pino from "pino";
import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  reqId: string;
}

/** ALS store — populated by getAuthUser() / requireAuth() for every request. */
export const requestStore = new AsyncLocalStorage<RequestContext>();

const isDev =
  (process.env.NODE_ENV ?? "").split(/-/)[0] === "dev" ||
  process.env.NODE_ENV === "development";

const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
  mixin() {
    const ctx = requestStore.getStore();
    return ctx ? { reqId: ctx.reqId } : {};
  },
});

export default logger;
export { logger as log };
