// Payout pledge ledger: an append-only, hash-chained list of entries.
// Runs unchanged in the browser and in Node 20+ (both have crypto.subtle).
//
// Every entry is hashed over a fixed field order, and every entry carries the
// hash of the one before it. Editing, removing or reordering any past entry
// changes its hash and breaks every link after it, so `verify` catches it.
//
// Kinds:
//   pledge  entry 0 only. Carries the terms (share, statement). No deadline:
//           money goes out when and where I choose.
//   payout  money received from X. amount in cents, ref = payout id / statement.
//   grant   money given away. counterparty = who got it, ref = receipt URL / tx.
//   note    a public update, amount 0.
//   end     closes the pledge in public. No payouts can be logged after it;
//           grants still can, to give away anything left.

export const FIELDS = ["seq", "kind", "date", "amount", "currency", "counterparty", "ref", "note", "terms", "prev"];
export const ZERO = "0".repeat(64);

export function canonical(entry) {
  return JSON.stringify(FIELDS.map((k) => [k, entry[k] ?? null]));
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashEntry = (entry) => sha256(canonical(entry));

/** Build a new entry on top of `entries` (does not mutate). */
export async function makeEntry(entries, fields) {
  const last = entries[entries.length - 1];
  const entry = {
    seq: entries.length,
    kind: fields.kind,
    date: fields.date ?? new Date().toISOString().slice(0, 10),
    amount: fields.amount ?? 0,
    currency: fields.currency ?? "USD",
    counterparty: fields.counterparty ?? null,
    ref: fields.ref ?? null,
    note: fields.note ?? null,
    terms: fields.terms ?? null,
    prev: last ? last.hash : ZERO,
  };
  entry.hash = await hashEntry(entry);
  return entry;
}

export const cents = (n) => Math.round(Number(n) * 100);
export const money = (c, cur = "USD") =>
  (c < 0 ? "-" : "") + (cur === "USD" ? "$" : cur + " ") + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Check the chain and the promise.
 * chainOk: every hash and link is intact.
 * There is no deadline, so the only way to "break" it is to edit the past.
 */
export async function verify(entries, { now = new Date() } = {}) {
  const issues = [];
  const rows = [];
  let prev = ZERO;
  let lastDate = "";
  let ended = null;
  const terms = entries[0]?.terms;

  if (!entries.length || entries[0].kind !== "pledge" || !terms) issues.push({ seq: 0, msg: "entry 0 must be the pledge and carry its terms" });

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const want = await hashEntry(e);
    const okHash = want === e.hash;
    const okLink = e.prev === prev;
    const okSeq = e.seq === i;
    if (!okSeq) issues.push({ seq: i, msg: `seq is ${e.seq}, expected ${i}` });
    if (!okLink) issues.push({ seq: i, msg: "link to previous entry is broken" });
    if (!okHash) issues.push({ seq: i, msg: "contents changed after it was written" });
    if (i > 0 && e.terms != null) issues.push({ seq: i, msg: "terms can only be set by the pledge" });
    if (i > 0 && e.kind === "pledge") issues.push({ seq: i, msg: "only one pledge" });
    if (ended && (e.kind === "payout" || e.kind === "end")) issues.push({ seq: i, msg: "pledge already ended" });
    if (e.kind === "end") ended = e;
    if (!Number.isInteger(e.amount) || e.amount < 0) issues.push({ seq: i, msg: "amount must be whole cents, not negative" });
    if (e.date < lastDate) issues.push({ seq: i, msg: "date goes backwards" });
    lastDate = e.date;
    rows.push({ ...e, ok: okHash && okLink && okSeq });
    prev = e.hash; // follow the stored hash so a single edit is pinned to its own row
  }

  // Accounting: each payout adds share × amount to what's still to give.
  const share = terms?.shareBps ?? 10000;
  let received = 0, owed = 0, given = 0;
  for (const e of entries) {
    if (e.kind === "payout") {
      received += e.amount;
      owed += Math.ceil((e.amount * share) / 10000);
    } else if (e.kind === "grant") given += e.amount;
  }
  const chainOk = issues.length === 0;
  return {
    chainOk,
    kept: chainOk,
    ended: ended ? ended.date : null,
    issues,
    rows,
    terms,
    received,
    owed,
    given,
    outstanding: Math.max(0, owed - given),
    head: entries[entries.length - 1]?.hash ?? ZERO,
  };
}
