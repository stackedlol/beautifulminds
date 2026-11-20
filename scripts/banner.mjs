#!/usr/bin/env node
// Builds assets/banner.gif (README header) from scripts/banner.html.
// Needs the dev server (npm run dev), ffmpeg and a headless Chromium:
//   CHROME=/path/to/chrome-headless-shell node scripts/banner.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME ?? "chrome-headless-shell";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "banner-"));
const FPS = 12, SECONDS = 3, T0 = 12;
const n = FPS * SECONDS;

// forward then back, so the loop has no jump
const times = [...Array(n).keys()].map((i) => T0 + i / FPS);
const seq = [...times, ...times.slice(1, -1).reverse()];
seq.forEach((t, i) => {
  execFileSync(chrome, [
    "--headless", `--user-data-dir=${path.join(tmp, "profile")}`, "--use-gl=angle", "--use-angle=swiftshader",
    "--hide-scrollbars", "--window-size=1000,250", "--virtual-time-budget=2000",
    `--screenshot=${path.join(tmp, `f${String(i).padStart(3, "0")}.png`)}`,
    `http://127.0.0.1:${process.env.PORT ?? 3016}/scripts/banner.html?t=${t.toFixed(4)}`,
  ], { stdio: "ignore" });
});

execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "f%03d.png"),
  "-filter_complex", "[0:v]split[a][b];[a]palettegen=max_colors=8:stats_mode=full[p];[b][p]paletteuse=dither=none",
  "-loop", "0", path.join(root, "assets/banner.gif"),
]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote assets/banner.gif (${seq.length} frames)`);
