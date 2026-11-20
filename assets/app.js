import { shader, FIELD, BAR, flatCss } from "./gl.js";
import { verify, money } from "../ledger/chain.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.querySelectorAll(".cmap").forEach((el) => (el.style.background = flatCss()));

/* ---------------- field + bar, one loop ---------------- */
const view = $("#view");
const field = shader($("#fieldgl"), FIELD);
const bar = shader($("#bargl"), BAR);

const plane = Math.max(0, Math.min(2, +(params.get("plane") ?? 1)));
const weights = [0, 0, 0];
weights[plane] = 1;

let fieldVisible = true;
new IntersectionObserver(([e]) => (fieldVisible = e.isIntersecting)).observe(view);

const clock0 = params.has("clock") ? +params.get("clock") : null;
function frame(now) {
  const t = clock0 ?? (reduced ? 12 : now / 1000);
  if (field && fieldVisible) field.draw(t, weights);
  if (bar) bar.draw(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------- ledger ---------------- */
const cache = {};
const load = async (name) => (cache[name] ??= await (await fetch(`ledger/${name}.json`, { cache: "no-store" })).json());

const day = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function show(src) {
  const entries = structuredClone(await load(src === "live" ? "ledger" : "demo"));
  if (src === "tamper") entries[3].amount = 1000; // dev only: ?src=tamper shows a broken seal
  const r = await verify(entries);
  const terms = r.terms ?? {};

  $("#b-in").textContent = money(r.received);
  $("#b-out").textContent = money(r.given);
  $("#b-left").textContent = money(r.outstanding);
  const pct = r.owed ? Math.min(1, r.given / r.owed) : 0;
  const N = 32, full = Math.round(pct * N);
  $("#cells").innerHTML = Array.from({ length: N }, (_, i) =>
    `<i class="${!r.owed ? "" : i < full ? "out" : "owe"}" style="transition-delay:${i * 12}ms"></i>`).join("");
  $("#m-pct").textContent = Math.round(pct * 100) + "% given";

  const bad = new Set(r.issues.map((i) => i.seq));
  // the chain: one block per entry, each tied to the one before
  $("#chain").innerHTML = r.rows.map((e, i) =>
    (i ? `<b class="${bad.has(e.seq) ? "cut" : ""}"></b>` : "") + `<i class="k-${bad.has(e.seq) ? "bad" : e.kind}" title="${e.kind}"></i>`).join("");
  $("#chaincap").textContent = r.chainOk ? "Each entry is sealed to the one before it" : "Seal broken at the edited entry";
  const first = r.rows[r.issues[0]?.seq];
  $("#b-note").textContent = !r.chainOk
    ? `The ${day(first.date)} entry was changed after it was written. The check caught it.`
    : r.outstanding
      ? `${money(r.outstanding)} still to give.${r.ended ? " Pledge ended " + day(r.ended) + "." : ""}`
      : r.ended ? `Pledge ended ${day(r.ended)}. Everything in went out.`
      : r.received ? "Everything in has gone out." : "Waiting on the first payout.";

  const st = $("#status");
  st.className = "chip status" + (r.kept ? " ok" : "");
  st.innerHTML = `<i></i>${r.chainOk ? "All records match" : "A record was changed"}`;

  $("#entries").innerHTML = r.rows
    .slice()
    .reverse()
    .map((e, i) => {
      const what = { pledge: "Pledge made", payout: "Payout from X", grant: `Donated · ${esc(e.counterparty)}`, note: "Update", end: "Pledge ended" }[e.kind];
      const sub = bad.has(e.seq)
        ? "Changed after it was written"
        : e.kind === "pledge" ? `${(terms.shareBps ?? 10000) / 100}% of every payout, no deadline`
        : e.kind === "grant" ? `<a href="${esc(e.ref)}" target="_blank" rel="noopener">Receipt ↗</a>`
        : esc(e.kind === "note" || e.kind === "end" ? e.note : e.ref);
      const amt = e.kind === "payout" ? "+" + money(e.amount) : e.kind === "grant" ? "−" + money(e.amount) : "";
      return `<li class="${bad.has(e.seq) ? "bad" : ""}" style="animation-delay:${i * 50}ms">
        <span class="dt">${day(e.date)}</span>
        <span class="what">${what}</span>
        <span class="a ${e.kind}">${amt}</span>
        <span class="sub">${sub}</span>
      </li>`;
    })
    .join("");
}
const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

show(params.get("src") ?? "live"); // ?src=demo|tamper is a dev preview only

/* ---------------- bar: current section ---------------- */
const links = [...document.querySelectorAll(".bar nav a")];
const io = new IntersectionObserver(
  (es) => es.forEach((e) => e.isIntersecting && links.forEach((a) => a.setAttribute("aria-current", a.hash === "#" + e.target.id))),
  { rootMargin: "-45% 0px -45% 0px" }
);
document.querySelectorAll("main > section").forEach((s) => io.observe(s));
