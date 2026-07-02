/**
 * Lightweight logger — drop-in replacement for pino.
 * No worker threads, no external deps, works in compiled binaries.
 */
const LEVELS: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const COLORS: Record<string, string> = {
  trace: "\x1b[90m", debug: "\x1b[36m", info: "\x1b[32m",
  warn: "\x1b[33m", error: "\x1b[31m", fatal: "\x1b[35m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const minLevel = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? 30;
const isCompiled = typeof Bun !== "undefined" && Bun.main?.includes("$bunfs") === true;
const useColor = !isCompiled && process.env.NODE_ENV !== "production";

class Logger {
  private _name: string;
  private _level: number;

  constructor(name: string, level?: number) {
    this._name = name;
    this._level = level ?? minLevel;
  }

  private _log(level: string, data: unknown, msg: string) {
    if ((LEVELS[level] ?? 0) < this._level) return;
    const ts = new Date().toISOString();
    const safeData = this._serializeError(data);

    if (isCompiled) {
      // JSON output for compiled binaries
      const entry: Record<string, unknown> = { level, time: ts, name: this._name, msg };
      if (safeData && typeof safeData === "object") Object.assign(entry, safeData);
      process.stdout.write(JSON.stringify(entry) + "\n");
    } else {
      // Colored human-readable output for dev
      const color = COLORS[level] ?? "";
      const prefix = `${color}${BOLD}${ts.split("T")[1]?.split(".")[0] ?? ""}${RESET} ${color}[${level.toUpperCase()}]${RESET} ${BOLD}(${this._name})${RESET}`;
      if (safeData && typeof safeData === "object" && Object.keys(safeData as object).length > 0) {
        const ctx = JSON.stringify(safeData, null, 0);
        console.log(`${prefix} ${color}${ctx}${RESET} ${msg}`);
      } else {
        console.log(`${prefix} ${msg}`);
      }
    }
  }

  private _serializeError(data: unknown): unknown {
    if (data === null || data === undefined || typeof data !== "object") return data;
    if (data instanceof Error) {
      return { name: data.name, message: data.message, stack: data.stack, ...(data.cause ? { cause: this._serializeError(data.cause) } : {}) };
    }
    if (Array.isArray(data)) return data.map((item) => this._serializeError(item));
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack, ...(value.cause ? { cause: this._serializeError(value.cause) } : {}) }
        : value;
    }
    return result;
  }

  trace(data: unknown, msg?: string): void {
    this._log("trace", data, msg ?? (typeof data === "string" ? data : ""));
  }
  debug(data: unknown, msg?: string): void {
    this._log("debug", data, msg ?? (typeof data === "string" ? data : ""));
  }
  info(data: unknown, msg?: string): void {
    this._log("info", data, msg ?? (typeof data === "string" ? data : ""));
  }
  warn(data: unknown, msg?: string): void {
    this._log("warn", data, msg ?? (typeof data === "string" ? data : ""));
  }
  error(data: unknown, msg?: string): void {
    this._log("error", data, msg ?? (typeof data === "string" ? data : ""));
  }
  fatal(data: unknown, msg?: string): void {
    this._log("fatal", data, msg ?? (typeof data === "string" ? data : ""));
  }

  child(bindings: Record<string, unknown>): Logger {
    const child = new Logger(this._name, this._level);
    // Merge bindings into output
    const origLog = child._log.bind(child);
    child._log = (level: string, data: unknown, msg: string) => {
      const merged = { ...bindings, ...(data && typeof data === "object" ? data : {}) };
      origLog(level, merged, msg);
    };
    return child;
  }

  level(level: string | number): void {
    this._level = typeof level === "string" ? (LEVELS[level] ?? 30) : level;
  }
}

const _cache = new Map<string, Logger>();

export function getLogger(name?: string): Logger {
  const key = name ?? "__default__";
  if (!_cache.has(key)) _cache.set(key, new Logger(name ?? "tns"));
  return _cache.get(key)!;
}
