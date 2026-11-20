# For Beautiful Minds

Every X creator payout I receive goes to research and therapies for BPD,
schizophrenia, autism and ADHD. Every dollar in and out is logged here, with receipts.

**[beautifulmind.site](https://beautifulmind.site)**

## How it's kept honest

- **Ledger** — `ledger/ledger.json`, a SHA-256 hash chain. Each entry seals the one
  before it, so editing the past breaks the chain.
- **Check** — `node scripts/ledger.mjs verify`, run by GitHub Actions on every push and daily.
- **Smart contract** — `contracts/src/PayoutPledge.sol` (Foundry): the same record on a
  public chain. Share fixed at deploy, every payout and grant a permanent event,
  `end()` to close the pledge in public, `anchor()` to pin the ledger's head hash.
- **Site** — plain HTML + WebGL, no build step.

## Run

```sh
npm run dev                          # http://127.0.0.1:3016
node scripts/ledger.mjs payout 15.00 --ref "X payout · Nov 2026"
node scripts/ledger.mjs grant 15 --to "Org" --ref <receipt-url>
node scripts/ledger.mjs verify
cd contracts && forge test
```
