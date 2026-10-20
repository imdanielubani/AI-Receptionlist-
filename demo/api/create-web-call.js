// Creates a Retell web call for the one configured agent. Only dynamic variables may vary.
import { authorized, retell } from "./_retell.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authorized(req, res)) return;
  const vars = req.body && typeof req.body === "object" ? req.body.retell_llm_dynamic_variables : undefined;
  const r = await retell("POST", "/v3/create-web-call", {
    agent_id: process.env.RETELL_AGENT_ID,
    ...(vars && typeof vars === "object" ? { retell_llm_dynamic_variables: vars } : {}),
    metadata: { source: "vercel-demo" },
  });
  res.status(r.status).setHeader("Content-Type", "application/json").send(r.text);
}
