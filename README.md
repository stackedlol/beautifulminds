<p align="center">
  <img src="assets/banner.gif" width="100%" alt="For Beautiful Minds">
</p>

# For Beautiful Minds

Every X creator payout I receive goes to research and therapies for **BPD, schizophrenia,
autism and ADHD**. This repo is the proof: every dollar in, every dollar out, with receipts.

**[beautifulmind.site](https://beautifulmind.site)** &nbsp;·&nbsp; [![verify pledge](https://github.com/stackedlol/beautifulminds/actions/workflows/verify.yml/badge.svg)](https://github.com/stackedlol/beautifulminds/actions/workflows/verify.yml)

## How it's kept honest

### 1 · Every dollar gets written down

Each payout from X and each donation is one line in [`ledger/ledger.json`](ledger/ledger.json).
Donations link to the charity's receipt.

```json
{
  "kind": "grant",
  "date": "2026-12-09",
  "amount": 30000,
  "counterparty": "Brain & Behavior Research Foundation",
  "ref": "https://…/receipt.pdf",
  "prev": "bb15554919278e94…",
  "hash": "70bc8cac5a6bbcb4…"
}
```

`amount` is in cents, so that's $300.00.

### 2 · Every line is sealed to the one before it

Each line gets a fingerprint (`hash`) made from what it says **plus the fingerprint of the line before it** (`prev`).
Quietly change an old number and its fingerprint no longer matches, which breaks every line after it.

```diff
  "amount": 30000   →  hash 70bc8cac5a6bbcb4…   ✓ matches what's on record
- "amount": 30000
+ "amount": 1000    →  hash 8be4354330fdbda9…   ✗ doesn't match. Chain broken.
```

### 3 · A bot checks it every day, in public

GitHub Actions re-checks the whole record on every change and once a day.
If anything in the past was edited, the badge above turns red for everyone to see.

```console
$ node scripts/ledger.mjs verify
✓ ledger/ledger.json: 6 entries intact
  received $940.47 · given $412.37 · still to give $528.10
```

### 4 · The same promise as a smart contract

[`contracts/src/PayoutPledge.sol`](contracts/src/PayoutPledge.sol) writes the pledge in code
that nobody can edit, me included, once it's on a public blockchain.

```solidity
uint16 public immutable shareBps;              // 10000 = 100% of every payout. Fixed forever.

function recordPayout(...) external;           // money in from X
function recordGrant(...)  external;           // money out, with who got it and the receipt
function outstandingCents() external view;     // anyone can read what's still to give
function end(string reason) external;          // I can stop, but only in public
function anchor(uint256 seq, bytes32 head);    // pins this ledger so history can't be rewritten
```

Written and tested (7 passing tests). Not deployed yet.

## What it can't do

I fill the record in by hand. It proves nothing was **changed** afterwards, not that nothing was
**left out**. That's why every payout comes with a screenshot of X's own statement.
