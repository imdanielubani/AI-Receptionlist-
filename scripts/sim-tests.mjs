// Runs a client's simulated test calls on Retell (test case definitions + batch test) and reports.
// Usage: node scripts/sim-tests.mjs <receptionist-dir> [--only name1,name2]
//   <receptionist-dir> needs tests.json and .ids.json ({ llm_id, llm_version? }).
//   tests.json: [{ "name", "must_pass": bool, "open": true|false|null, "user_prompt", "metrics": [..],
//                  "dynamic_variables"?: {}, "tool_mocks"?: [] }]
//   "open" mocks check_open; transfer_to_team is always mocked so no real call is placed.
// Writes test-defs.json (name → definition id) and test-results.json in the same dir.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1].split(",") : null;
const key = readFileSync(join(root, ".env"), "utf8").match(/^RETELL_API_KEY=(.+)$/m)[1].trim();
const { llm_id, llm_version } = JSON.parse(readFileSync(join(dir, ".ids.json"), "utf8"));
const tests = JSON.parse(readFileSync(join(dir, "tests.json"), "utf8")).filter((t) => !only || only.includes(t.name));
const defsPath = join(dir, "test-defs.json");
const defs = existsSync(defsPath) ? JSON.parse(readFileSync(defsPath, "utf8")) : {};
const SIM_USER_MODEL = "claude-5.5-haiku";

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

const openMock = (open) => ({
  tool_name: "check_open",
  input_match_rule: { type: "any" },
  output: JSON.stringify(open ? { open: true, holiday: false, next_open: "tomorrow at 09:00" } : { open: false, holiday: false, next_open: "tomorrow at 09:00" }),
});
const transferMock = { tool_name: "transfer_to_team", input_match_rule: { type: "any" }, output: JSON.stringify({ transferred: true }), result: true };
const engine = { type: "retell-llm", llm_id, ...(llm_version !== undefined ? { version: llm_version } : {}) };

// Simulated callers otherwise keep pushing after they've been answered, which Retell aborts as a "loop".
const WRAP_UP = " Once the agent has answered you or told you the next step, accept it, say goodbye and end the call. Don't repeat the same question more than twice.";
const label = dir.split(/[\\/]/).filter(Boolean).slice(-2)[0];

for (const t of tests) {
  const openVars = t.open === null || t.open === undefined ? {} : { office_open: String(t.open), next_open: "tomorrow at 09:00" };
  const body = {
    name: `${label} · ${t.name}`.slice(0, 120),
    response_engine: engine,
    user_prompt: t.user_prompt + WRAP_UP,
    metrics: t.metrics,
    llm_model: SIM_USER_MODEL,
    dynamic_variables: { ...openVars, ...(t.dynamic_variables || {}) },
    tool_mocks: [...(t.open === null || t.open === undefined ? [] : [openMock(t.open)]), transferMock, ...(t.tool_mocks || [])],
  };
  if (defs[t.name]) await api("PUT", `/update-test-case-definition/${defs[t.name]}`, body).catch(async () => {
    defs[t.name] = (await api("POST", "/create-test-case-definition", body)).test_case_definition_id;
  });
  else defs[t.name] = (await api("POST", "/create-test-case-definition", body)).test_case_definition_id;
}
writeFileSync(defsPath, JSON.stringify(defs, null, 2));

const batch = await api("POST", "/create-batch-test", { test_case_definition_ids: tests.map((t) => defs[t.name]), response_engine: engine });
const id = batch.test_case_batch_job_id;
console.log(`Batch ${id}: ${tests.length} cases running…`);
let status;
for (let i = 0; i < 120; i++) {
  status = await api("GET", `/get-batch-test/${id}`);
  if (status.status === "complete") break;
  await new Promise((r) => setTimeout(r, 10000));
}
const runs = (await api("GET", `/v2/list-test-runs/${id}`)).items ?? [];
const byDef = Object.fromEntries(Object.entries(defs).map(([n, d]) => [d, n]));
const rows = runs.map((r) => {
  const name = byDef[r.test_case_definition_id] || r.test_case_definition_id;
  const t = tests.find((x) => x.name === name) || {};
  return { name, must_pass: !!t.must_pass, status: r.status, explanation: r.result_explanation, test_case_job_id: r.test_case_job_id };
});
const pass = rows.filter((r) => r.status === "pass").length;
const mustFail = rows.filter((r) => r.must_pass && r.status !== "pass");
console.log(`Status ${status.status}: pass ${pass}/${rows.length} (${Math.round((100 * pass) / Math.max(rows.length, 1))}%), must-pass failures ${mustFail.length}`);
for (const r of rows) console.log(`${r.status === "pass" ? "✓" : "✗"} ${r.must_pass ? "[must] " : ""}${r.name}${r.status === "pass" ? "" : ` (${r.status}): ${String(r.explanation || "").slice(0, 300)}`}`);
writeFileSync(join(dir, "test-results.json"), JSON.stringify({ date: new Date().toISOString(), batch_id: id, llm_id, pass, total: rows.length, rows }, null, 2));
