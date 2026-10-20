// Shared helpers for the demo's Vercel functions. Files starting with "_" aren't exposed as routes.
// Environment variables (set in Vercel → Project → Settings → Environment Variables):
//   RETELL_API_KEY   the Retell key (never commit it)
//   RETELL_AGENT_ID  the only agent this demo may call, e.g. agent_c4bd65c00cc36407ae55bd607a
//   DEMO_PASSWORD    password visitors must enter before calling
//   DEMO_TITLE       optional page title, e.g. "Kedali Med Transportation"
import { timingSafeEqual } from "node:crypto";

export function authorized(req, res) {
  const expected = process.env.DEMO_PASSWORD || "";
  const given = String(req.headers["x-demo-password"] || "");
  const ok =
    expected.length > 0 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) res.status(401).json({ error: "Wrong or missing password" });
  return ok;
}

export async function retell(method, path, body) {
  const r = await fetch("https://api.retellai.com" + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, text: await r.text() };
}
