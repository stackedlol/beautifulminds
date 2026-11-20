#!/usr/bin/env node
// Ledger CLI. The only way entries should be written.
//
//   node scripts/ledger.mjs init                      write the pledge (entry 0)
//   node scripts/ledger.mjs payout 412.37 --ref "X payout 2026-12" [--date 2026-12-01]
//   node scripts/ledger.mjs grant 412.37 --to "Org name" --ref https://receipt [--note "..."]
//   node scripts/ledger.mjs note "Picked the first cause."
//   node scripts/ledger.mjs end ["Why I'm stopping."]   close the pledge in public
//   node scripts/ledger.mjs verify [file]             exit 1 if any past entry was changed
//   node scripts/ledger.mjs head                      print the head hash (to anchor on-chain)
//   node scripts/ledger.mjs demo                      regenerate ledger/demo.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeEntry, verify, cents, money } from "../ledger/chain.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = path.join(root, "ledger/ledger.json");
const DEMO = path.join(root, "ledger/demo.json");

export const TERMS = {
  shareBps: 10000, // 100% of every X creator payout
  statement:
    "Every X creator payout I receive, I give away to research, therapies and support for BPD, schizophrenia, autism, ADHD and other neurodivergent minds, when and where I choose. Every payout in, every dollar out, logged here with a receipt. If I ever stop, I'll say so here.",
};

const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[++i];
  else args.push(rest[i]);
}

const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const write = (f, entries) => fs.writeFileSync(f, JSON.stringify(entries, null, 2) + "\n");

async function append(fields) {
  const entries = read(LEDGER);
  const check = await verify(entries);
  if (!check.chainOk) fail("ledger is already broken; fix before appending", check);
  if (check.ended && (fields.kind === "payout" || fields.kind === "end")) fail(`the pledge ended on ${check.ended}; only grants and notes can be added`);
  const e = await makeEntry(entries, fields);
  write(LEDGER, [...entries, e]);
  console.log(`#${String(e.seq).padStart(3, "0")} ${e.kind} ${money(e.amount)}  ${e.hash}`);
}

function fail(msg, r) {
  console.error("✗ " + msg);
  for (const i of r?.issues ?? []) console.error(`  #${i.seq}: ${i.msg}`);
  process.exit(1);
}

switch (cmd) {
  case "init": {
    if (fs.existsSync(LEDGER)) fail("ledger.json exists; the pledge can only be written once");
    write(LEDGER, [await makeEntry([], { kind: "pledge", terms: TERMS, note: "Pledge opened.", date: flags.date })]);
    console.log("pledge written");
    break;
  }
  case "payout":
    await append({ kind: "payout", amount: cents(args[0]), ref: flags.ref, date: flags.date, note: flags.note });
    break;
  case "grant":
    if (!flags.to || !flags.ref) fail("a grant needs --to and --ref (a receipt anyone can check)");
    await append({ kind: "grant", amount: cents(args[0]), counterparty: flags.to, ref: flags.ref, date: flags.date, note: flags.note });
    break;
  case "end":
    await append({ kind: "end", note: args.join(" ") || "Pledge ended.", date: flags.date });
    break;
  case "note":
    await append({ kind: "note", note: args.join(" "), date: flags.date });
    break;
  case "head":
    console.log(read(LEDGER).at(-1).hash);
    break;
  case "demo": {
    let e = [];
    const add = async (f) => (e = [...e, await makeEntry(e, f)]);
    await add({ kind: "pledge", terms: TERMS, note: "Pledge opened.", date: "2026-11-18" });
    await add({ kind: "payout", amount: 41237, ref: "X creator payout · Nov 2026", date: "2026-11-28" });
    await add({ kind: "note", note: "DEMO DATA. Shortlist: BPD and schizophrenia research funds, DBT access programs.", date: "2026-12-02" });
    await add({ kind: "grant", amount: 30000, counterparty: "Example research fund (demo)", ref: "https://example.org/receipt/0001", date: "2026-12-09" });
    await add({ kind: "grant", amount: 11237, counterparty: "Example therapy access program (demo)", ref: "https://example.org/receipt/0002", date: "2026-12-20" });
    await add({ kind: "payout", amount: 52810, ref: "X creator payout · Dec 2026", date: "2026-12-29" });
    write(DEMO, e);
    console.log(`demo.json: ${e.length} entries, head ${e.at(-1).hash}`);
    break;
  }
  case "verify":
  case undefined: {
    const file = args[0] ? path.resolve(args[0]) : LEDGER;
    const r = await verify(read(file));
    if (!r.chainOk) fail("chain broken", r);
    console.log(`✓ ${path.relative(root, file)}: ${r.rows.length} entries intact`);
    console.log(`  received ${money(r.received)} · owed ${money(r.owed)} · given ${money(r.given)} · outstanding ${money(r.outstanding)}`);
    if (r.ended) console.log(`  pledge ended ${r.ended}`);
    console.log(`  head ${r.head}`);
    break;
  }
  default:
    fail(`unknown command ${cmd}`);
}
