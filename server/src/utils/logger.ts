import { pino, type Logger } from "pino";

let root: Logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export function configureLogger(level: string): Logger {
  root = pino({ level, base: { svc: "huambo-server", pid: process.pid } });
  return root;
}

export function log(): Logger {
  return root;
}
