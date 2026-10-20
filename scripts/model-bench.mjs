// Times candidate LLM models on a client's real prompt + tools via Retell's text playground,
// and checks each one makes the required tool call and holds the required refusals.
// Creates throwaway zz-modeltest-* LLMs/agents and always deletes them.
//
// Usage: node scripts/model-bench.mjs <receptionist-dir> <model,model,...> [--runs 2]
//   <receptionist-dir> must contain llm.json, agent.json and model-cases.json:
//   [{ "name": "...", "messages": [{ "role": "agent"|"user", "content": "..." }],
//      "dynamic_variables": {...}?, "tool_mocks": [...]?,
//      "expect": { "tool": "name"?, "no_tool": "name"?, "includes_any": ["..."]?, "excludes_regex": "..."? } }]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [dir, modelList] = process.argv.slice(2);
const runsIdx = process.argv.indexOf("--runs");
const RUNS = runsIdx > 0 ? Number(process.argv[runsIdx + 1]) : 2;
if (!dir || !modelList) {
  console.error("Usage: node scripts/model-bench.mjs <receptionist-dir> <model,model,...> [--runs 2]");
  process.exit(1);
}
const key = readFileSync(join(root, ".env"), "utf8").match(/^RETELL_API_KEY=(.+)$/m)?.[1].trim();
const llmBase = JSON.parse(readFileSync(join(dir, "llm.json"), "utf8"));
const agentBase = JSON.parse(readFileSync(join(dir, "agent.json"), "utf8"));
const cases = JSON.parse(readFileSync(join(dir, "model-cases.json"), "utf8"));

async function api(method, path, body) {
  const res = await fetch("https://api.retellai.com" + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

function judge(c, msgs) {
  const tools = msgs.filter((m) => m.role === "tool_call_invocation").map((m) => m.name);
  const text = msgs.filter((m) => m.role === "agent").map((m) => m.content).join(" ");
  const fails = [];
  const x = c.expect || {};
  if (x.tool && !tools.includes(x.tool)) fails.push(`missing tool ${x.tool}`);
  if (x.no_tool && tools.includes(x.no_tool)) fails.push(`called ${x.no_tool}`);
  if (x.includes_any && !x.includes_any.some((s) => text.toLowerCase().includes(s.toLowerCase()))) fails.push(`none of [${x.includes_any.join(", ")}]`);
  if (x.excludes_regex && new RegExp(x.excludes_regex, "i").test(text)) fails.push(`matched /${x.excludes_regex}/`);
  return { ok: fails.length === 0, fails, tools, text };
}

const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor((s.length - 1) / 2)]; };
const results = [];

for (const model of modelList.split(",")) {
  let llmId, agentId;
  const r = { model, times: [], cases: [] };
  try {
    ({ llm_id: llmId } = await api("POST", "/create-retell-llm", { ...llmBase, model }));
    ({ agent_id: agentId } = await api("POST", "/create-agent", {
      ...agentBase,
      agent_name: `zz-modeltest-${model}`,
      response_engine: { type: "retell-llm", llm_id: llmId },
    }));
    for (const c of cases) {
      const caseRes = { name: c.name, runs: [] };
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        const out = await api("POST", `/agent-playground-completion/${agentId}`, {
          messages: c.messages,
          ...(c.dynamic_variables ? { dynamic_variables: c.dynamic_variables } : {}),
          ...(c.tool_mocks ? { tool_mocks: c.tool_mocks } : {}),
        });
        const ms = Math.round(performance.now() - t0);
        r.times.push(ms);
        caseRes.runs.push({ ms, ...judge(c, out.messages || []) });
      }
      r.cases.push(caseRes);
    }
  } catch (e) {
    r.error = e.message;
  } finally {
    if (agentId) await api("DELETE", `/delete-agent/${agentId}`).catch((e) => (r.cleanup = e.message));
    if (llmId) await api("DELETE", `/delete-retell-llm/${llmId}`).catch((e) => (r.cleanup = e.message));
  }
  r.median_ms = r.times.length ? median(r.times) : null;
  r.max_ms = r.times.length ? Math.max(...r.times) : null;
  r.passed = r.cases.filter((c) => c.runs.every((x) => x.ok)).length;
  results.push(r);
  console.log(`${model.padEnd(20)} median ${r.median_ms} ms  max ${r.max_ms} ms  passed ${r.passed}/${cases.length}${r.error ? "  ERROR " + r.error : ""}`);
  for (const c of r.cases) for (const x of c.runs) if (!x.ok) console.log(`   ✗ ${c.name}: ${x.fails.join("; ")} | tools=[${x.tools}] | "${x.text.slice(0, 160)}"`);
}

writeFileSync(join(dir, "model-bench.json"), JSON.stringify({ date: new Date().toISOString(), runs: RUNS, results }, null, 2));
console.log(`Saved ${join(dir, "model-bench.json")}`);
