import { authorized, retell } from "./_retell.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!authorized(req, res)) return;
  const id = String(req.query.id || "");
  if (!/^call_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: "bad id" });
  const r = await retell("POST", `/v2/stop-call/${id}`);
  res.status(r.status).setHeader("Content-Type", "application/json").send(r.text || "{}");
}
