export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ title: process.env.DEMO_TITLE || "Voice demo" });
}
