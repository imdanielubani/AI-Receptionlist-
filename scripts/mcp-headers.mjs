// headersHelper for .mcp.json: reads a key from .env and prints an auth header as JSON.
// Usage: node scripts/mcp-headers.mjs <ENV_VAR_NAME> [HeaderName] [Prefix]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [name, header = "Authorization", prefix = "Bearer "] = process.argv.slice(2);
const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
const line = readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith(`${name}=`));
if (!line) {
  console.error(`${name} not found in .env`);
  process.exit(1);
}
const value = line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
process.stdout.write(JSON.stringify({ [header]: `${prefix}${value}` }));
