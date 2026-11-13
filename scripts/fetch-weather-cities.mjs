import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

// GeoNames daily cities15000 + first-level administration dataset, CC BY 4.0.
// Run manually to refresh the bundled offline search index; no end-user network lookup.
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../electron/main/weather/data");
const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(90000) }); if (!r.ok) throw new Error("GeoNames HTTP " + r.status); return r; };
const [archive, admins] = await Promise.all([
  get("https://download.geonames.org/export/dump/cities15000.zip").then((r) => r.arrayBuffer()),
  get("https://download.geonames.org/export/dump/admin1CodesASCII.txt").then((r) => r.text()),
]);
const zip = await JSZip.loadAsync(archive);
const source = await zip.file("cities15000.txt").async("string");
const adminMap = new Map(admins.trim().split("\n").map((line) => { const p = line.split("\t"); return [p[0], p[1]]; }));
// GeoNames alternate names are unordered and do not identify their writing system.
const preferredNames = JSON.parse(await fs.readFile(new URL("../electron/main/weather/data/city-name-overrides.json", import.meta.url), "utf8"));
const records = source.trim().split("\n").map((line) => {
  const p = line.split("\t");
  const geonameId = Number(p[0]);
  const aliases = p[3].split(",").filter((v) => /^[\p{Script=Han}·・]+$/u.test(v));
  const name = preferredNames[String(geonameId)] ?? aliases.find((v) => v.endsWith("市")) ?? aliases[0] ?? p[1];
  return [geonameId, name, p[1], [...new Set([p[2], ...aliases])].join("|"), p[8], adminMap.get(p[8] + "." + p[10]) ?? "", Number(p[4]), Number(p[5]), Number(p[14])];
}).sort((a, b) => b[8] - a[8]);
await fs.mkdir(output, { recursive: true });
const target = path.join(output, "cities.json");
await fs.writeFile(target + ".tmp", JSON.stringify(records) + "\n", "utf8");
await fs.rename(target + ".tmp", target);
console.log("Bundled " + records.length + " cities from GeoNames (CC BY 4.0).");
