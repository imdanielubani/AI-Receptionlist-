// Post-call results for the page: transcript, latency, analysis. Only for this demo's agent.
import { authorized, retell } from "./_retell.js";

export default async function handler(req, res) {
  if (!authorized(req, res)) return;
  const id = String(req.query.id || "");
  if (!/^call_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: "bad id" });
  const r = await retell("GET", `/v2/get-call/${id}`);
  if (r.status !== 200) return res.status(r.status).setHeader("Content-Type", "application/json").send(r.text);
  const c = JSON.parse(r.text);
  if (c.agent_id !== process.env.RETELL_AGENT_ID) return res.status(403).json({ error: "not this agent's call" });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    call_status: c.call_status,
    disconnection_reason: c.disconnection_reason,
    duration_ms: c.duration_ms ?? (c.end_timestamp && c.start_timestamp ? c.end_timestamp - c.start_timestamp : null),
    transcript_object: c.transcript_object,
    transcript_with_tool_calls: c.transcript_with_tool_calls,
    latency: c.latency,
    call_analysis: c.call_analysis,
  });
}
