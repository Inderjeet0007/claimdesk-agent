// Minimal .env loader (no dependency, works on any Node version).
// Real environment variables win over the file, so
//   EXPOSE_TOOL_CALLS=true npm start
// still overrides whatever .env says.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");

try {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (value !== "" && process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
