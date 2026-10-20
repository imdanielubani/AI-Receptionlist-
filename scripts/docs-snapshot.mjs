// Snapshot a platform's docs and report what changed since the last accepted snapshot.
//
// Usage:
//   node scripts/docs-snapshot.mjs <platform>           fetch into snapshot/incoming/ and print the diff
//   node scripts/docs-snapshot.mjs <platform> --accept  promote incoming/ to current/ (run after /docs is updated)
//
// Reads docs/platforms/<platform>/sources.json:
//   { "llms_txt": url, "llms_full_txt": url|null, "openapi": url|null, "change_notices_prefix": url|null }
// If llms_full_txt is null, every page linked from llms.txt is fetched instead.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [platform, flag] = process.argv.slice(2);
if (!platform) {
  console.error("Usage: node scripts/docs-snapshot.mjs <platform> [--accept]");
  process.exit(1);
}
const dir = join(root, "docs", "platforms", platform);
const current = join(dir, "snapshot", "current");
const incoming = join(dir, "snapshot", "incoming");

if (flag === "--accept") {
  if (!existsSync(incoming)) {
    console.error("Nothing to accept: run without --accept first.");
    process.exit(1);
  }
  await rm(current, { recursive: true, force: true });
  await rename(incoming, current);
  console.log(`Accepted snapshot for ${platform}.`);
  process.exit(0);
}

const sources = JSON.parse(await readFile(join(dir, "sources.json"), "utf8"));
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

async function get(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// llms.txt links -> one full-text file in the same "# Title\nSource: url" format as llms-full.txt.
async function buildFull(index) {
  const links = [...index.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ title: m[1], url: m[2] }));
  const out = [];
  for (let i = 0; i < links.length; i += 8) {
    const batch = await Promise.all(
      links.slice(i, i + 8).map(async (l) => {
        try {
          return `# ${l.title}\nSource: ${l.url}\n\n${await get(l.url)}\n`;
        } catch (e) {
          return `# ${l.title}\nSource: ${l.url}\n\n(FETCH FAILED: ${e.message})\n`;
        }
      }),
    );
    out.push(...batch);
  }
  return out.join("\n");
}

// Full text -> [{ url, title, body }]. A page starts with "# Title" followed by "Source: url".
function splitPages(text) {
  const lines = text.split(/\r?\n/);
  const pages = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^Source: (\S+)/);
    if (m && i > 0 && lines[i - 1].startsWith("# ")) {
      if (cur) cur.body.pop(); // the title line belongs to the new page
      cur = { url: m[1], title: lines[i - 1].slice(2).trim(), body: [] };
      pages.push(cur);
      continue;
    }
    if (cur) cur.body.push(lines[i]);
  }
  return pages.map((p) => ({ ...p, body: p.body.join("\n") }));
}

const sectionOf = (url) => new URL(url).pathname.split("/").filter(Boolean)[0]?.replace(/\.md$/, "") || "root";

// OpenAPI (YAML or JSON) -> { "path /x": hash, "schemas Name": hash }, plus revision string.
function splitSpec(text) {
  const blocks = {};
  if (text.trimStart().startsWith("{")) {
    const spec = JSON.parse(text);
    for (const [p, v] of Object.entries(spec.paths || {})) blocks[`path ${p}`] = sha(JSON.stringify(v));
    for (const [sub, group] of Object.entries(spec.components || {}))
      for (const [n, v] of Object.entries(group)) blocks[`${sub} ${n}`] = sha(JSON.stringify(v));
    return { blocks, revision: [spec.info?.version, ...Object.entries(spec.info || {}).filter(([k]) => /revision/i.test(k)).map(([, v]) => v)].filter(Boolean).join(" ") };
  }
  let top = null, sub = null, key = null, buf = [];
  const flush = () => { if (key) blocks[key] = sha(buf.join("\n")); key = null; buf = []; };
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^([^\s#][^:]*):/))) { flush(); top = m[1]; sub = null; continue; }
    if (top === "paths" && (m = line.match(/^  ['"]?(\/[^'":]*)['"]?:\s*$/))) { flush(); key = `path ${m[1]}`; continue; }
    if (top === "components" && (m = line.match(/^  (\w+):\s*$/))) { flush(); sub = m[1]; continue; }
    if (top === "components" && sub && (m = line.match(/^    ['"]?([\w.-]+)['"]?:\s*$/))) { flush(); key = `${sub} ${m[1]}`; continue; }
    if (key) buf.push(line);
  }
  flush();
  const head = text.split(/\r?\n/).slice(0, 40).join("\n");
  const revision = [...head.matchAll(/^\s+(version|x-[\w-]*revision):\s*['"]?([^'"\s]+)/gm)].map((m) => m[2]).join(" ");
  return { blocks, revision };
}

function diff(before = {}, after = {}) {
  const v = (x) => (typeof x === "object" ? x.hash : x);
  const added = [], removed = [], changed = [];
  for (const k of Object.keys(after)) {
    if (!(k in before)) added.push(k);
    else if (v(before[k]) !== v(after[k])) changed.push(k);
  }
  for (const k of Object.keys(before)) if (!(k in after)) removed.push(k);
  return { added, removed, changed };
}

// Fetch
const index = await get(sources.llms_txt);
const full = sources.llms_full_txt ? await get(sources.llms_full_txt) : await buildFull(index);
const specText = sources.openapi ? await get(sources.openapi) : null;
const specExt = specText?.trimStart().startsWith("{") ? "json" : "yaml";

// Index
const pages = splitPages(full);
const pageMap = Object.fromEntries(pages.map((p) => [p.url, { title: p.title, section: sectionOf(p.url), hash: sha(p.body) }]));
const spec = specText ? splitSpec(specText) : { blocks: {}, revision: null };
const manifest = {
  platform,
  snapshot_date: new Date().toISOString().slice(0, 10),
  spec_revision: spec.revision,
  files: { llms_txt: sha(index), llms_full_txt: sha(full), openapi: specText ? sha(specText) : null },
  pages: pageMap,
  spec: spec.blocks,
};

// Write incoming/
await rm(incoming, { recursive: true, force: true });
await mkdir(join(incoming, "sections"), { recursive: true });
await writeFile(join(incoming, "llms.txt"), index);
await writeFile(join(incoming, "llms-full.txt"), full);
if (specText) await writeFile(join(incoming, `openapi.${specExt}`), specText);
const bySection = {};
for (const p of pages) (bySection[sectionOf(p.url)] ??= []).push(`# ${p.title}\nSource: ${p.url}\n${p.body}`);
for (const [s, list] of Object.entries(bySection)) await writeFile(join(incoming, "sections", `${s}.md`), list.join("\n\n"));
await writeFile(join(incoming, "manifest.json"), JSON.stringify(manifest, null, 2));

// Diff against current/
const prevPath = join(current, "manifest.json");
const prev = existsSync(prevPath) ? JSON.parse(await readFile(prevPath, "utf8")) : null;
const days = prev ? Math.round((Date.parse(manifest.snapshot_date) - Date.parse(prev.snapshot_date)) / 864e5) : null;
const pd = diff(prev?.pages, pageMap);
const sd = diff(prev?.spec, spec.blocks);
const prefix = sources.change_notices_prefix;
const notices = prefix ? [...pd.added, ...pd.changed].filter((u) => u.startsWith(prefix)).map((u) => `${pageMap[u].title} <${u}>`) : [];
const anyChange = !prev || pd.added.length + pd.removed.length + pd.changed.length + sd.added.length + sd.removed.length + sd.changed.length > 0;

const report = {
  platform,
  verdict: !prev ? "first-run" : anyChange ? "changed" : days > 90 ? "stale" : "up-to-date",
  previous_snapshot: prev?.snapshot_date ?? null,
  days_since_previous: days,
  spec_revision: { before: prev?.spec_revision ?? null, after: spec.revision },
  pages_total: pages.length,
  sections: Object.fromEntries(Object.entries(bySection).map(([s, l]) => [s, l.length]).sort((a, b) => b[1] - a[1])),
  change_notices: notices,
  pages: prev ? pd : { added: pd.added.length, removed: 0, changed: 0 },
  spec: prev ? sd : { added: sd.added.length, removed: 0, changed: 0 },
};
await writeFile(join(incoming, "diff.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
