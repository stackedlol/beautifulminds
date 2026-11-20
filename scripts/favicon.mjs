#!/usr/bin/env node
// Writes assets/favicon.svg + assets/favicon.png from scripts/favicon.html.
// Needs the dev server (npm run dev) and a headless Chromium:
//   CHROME=/path/to/chrome-headless-shell node scripts/favicon.mjs [--t 12] [--n 32]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes("--" + k) ? args[args.indexOf("--" + k) + 1] : d);
const chrome = process.env.CHROME ?? "chrome-headless-shell";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "favicon-"));

const dom = execFileSync(chrome, [
  "--headless", `--user-data-dir=${profile}`, "--use-gl=angle", "--use-angle=swiftshader",
  "--virtual-time-budget=3000", "--dump-dom",
  `http://127.0.0.1:3016/scripts/favicon.html?t=${flag("t", 12)}&n=${flag("n", 32)}`,
], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
fs.rmSync(profile, { recursive: true, force: true });

const json = dom.match(/<pre id="out">([^<]+)<\/pre>/)?.[1];
if (!json) throw new Error("favicon page produced no output");
const { svg, png } = JSON.parse(json.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
fs.writeFileSync(path.join(root, "assets/favicon.svg"), svg + "\n");
fs.writeFileSync(path.join(root, "assets/favicon.png"), Buffer.from(png.split(",")[1], "base64"));
console.log("wrote assets/favicon.svg, assets/favicon.png");
