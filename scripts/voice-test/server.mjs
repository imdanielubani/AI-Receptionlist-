// Local voice test page for a client's Retell agent (a browser web call shown as a voice orb).
// The Retell API key stays here: the page's SDK sends its requests through this server, which
// only allows creating/stopping web calls for this one agent and reading back their results.
//
// Usage: node scripts/voice-test/server.mjs <client-slug | agent_id> [--port 4321] [--version N] [--no-open]
// Opens the page in the default browser unless --no-open is given.
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
if (!target) {
  const clientsDir = join(root, "clients");
  const clients = existsSync(clientsDir)
    ? readdirSync(clientsDir).filter((d) => !d.startsWith("_") && existsSync(join(clientsDir, d, "deploy.md")))
    : [];
  console.error("Give a client folder name or an agent ID, e.g.");
  console.error("  node scripts/voice-test/server.mjs bright-smile-dental");
  console.error("  node scripts/voice-test/server.mjs agent_27ac09670c64db718cfd20ac87");
  console.error(clients.length ? `Clients: ${clients.join(", ")}` : "No clients built yet: use an agent ID.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const apiKey = env.RETELL_API_KEY;
if (!apiKey) throw new Error("RETELL_API_KEY missing from .env");

// Resolve the agent and a display name from the client folder.
let agentId = target.startsWith("agent_") ? target : null;
let title = "Voice test";
if (!agentId) {
  const dir = join(root, "clients", target);
  const deploy = join(dir, "deploy.md");
  if (!existsSync(deploy)) throw new Error(`No ${deploy}`);
  agentId = readFileSync(deploy, "utf8").match(/Agent ID:\**\s*`?(agent_[A-Za-z0-9]+)/)?.[1];
  if (!agentId) throw new Error(`No "Agent ID: agent_..." line in ${deploy}`);
  const brief = join(dir, "brief.md");
  if (existsSync(brief)) title = readFileSync(brief, "utf8").match(/^# (.+?):/m)?.[1] || target;
}
const agentVersion = opt("version") ? Number(opt("version")) : undefined;
const port = Number(opt("port", 4321));
const RETELL = "https://api.retellai.com";

async function retell(method, path, body) {
  const res = await fetch(RETELL + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => (d += c)).on("end", () => resolve(d)).on("error", reject);
  });

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, readFileSync(join(here, "index.html"), "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/config.json") {
      return send(res, 200, { agentId, title });
    }
    // The SDK's create-web-call, pinned to this agent. Only dynamic variables may vary.
    if (req.method === "POST" && url.pathname === "/retell/v3/create-web-call") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const r = await retell("POST", "/v3/create-web-call", {
        agent_id: agentId,
        ...(agentVersion !== undefined ? { agent_version: agentVersion } : {}),
        ...(body.retell_llm_dynamic_variables ? { retell_llm_dynamic_variables: body.retell_llm_dynamic_variables } : {}),
        metadata: { source: "local-voice-test" },
      });
      return send(res, r.status, r.text);
    }
    let m;
    if (req.method === "POST" && (m = url.pathname.match(/^\/retell\/v2\/stop-call\/(call_[A-Za-z0-9]+)$/))) {
      const r = await retell("POST", `/v2/stop-call/${m[1]}`);
      return send(res, r.status, r.text || "{}");
    }
    // Post-call results for the page: transcript, latency, analysis.
    if (req.method === "GET" && (m = url.pathname.match(/^\/api\/call\/(call_[A-Za-z0-9]+)$/))) {
      const r = await retell("GET", `/v2/get-call/${m[1]}`);
      if (r.status !== 200) return send(res, r.status, r.text);
      const c = JSON.parse(r.text);
      if (c.agent_id !== agentId) return send(res, 403, { error: "not this agent's call" });
      return send(res, 200, {
        call_status: c.call_status,
        disconnection_reason: c.disconnection_reason,
        duration_ms: c.duration_ms ?? (c.end_timestamp && c.start_timestamp ? c.end_timestamp - c.start_timestamp : null),
        transcript_object: c.transcript_object,
        transcript_with_tool_calls: c.transcript_with_tool_calls,
        latency: c.latency,
        call_analysis: c.call_analysis,
        call_cost: c.call_cost,
      });
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(port, "127.0.0.1", () => {
  const url = `http://localhost:${port}`;
  console.log(`Voice test for "${title}" (${agentId}${agentVersion !== undefined ? ` v${agentVersion}` : ""}): ${url}`);
  console.log("Opening your browser. Press Ctrl+C here to stop.");
  if (!args.includes("--no-open")) {
    const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
