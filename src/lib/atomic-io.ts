import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { getLogger } from "../utils/logger";

const log = getLogger("atomic-io");

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = join(tmpdir(), `atomic-${randomBytes(8).toString("hex")}.tmp`);
  try {
    await writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tempPath, filePath);
  } catch (err) {
    try {
      await import("node:fs/promises").then((fs) => fs.unlink(tempPath).catch((e) => log.debug({ err: e }, "Failed to clean up temp file")));
    } catch (e) { log.debug({ err: e }, "Failed to import fs for cleanup"); }
    throw err;
  }
}

import { readFileSync } from "node:fs";

export function readJsonFileSync<T = unknown>(filePath: string): T | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (e) {
    log.debug({ err: e, path: filePath }, "Failed to read JSON file");
    return null;
  }
}
