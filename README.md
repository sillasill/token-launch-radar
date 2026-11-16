# Token Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sillasill/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sillasill/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)


The best token launch radar: a program that reads a frozen DefiLlama snapshot of
758 protocols and hands in a web dashboard ranking the pre-token ones by implied
value, each with a concrete farm plan.

## What it answers

Which pre-token protocol is worth farming next, and what do I do about it? The
board never predicts whether or when a token is issued. Its implied value is the
entry's own model claim, and a protocol is said to *record no token*, never to
have none.

## The model (radar-2)

`lib/model.ts` — one function scores every row, from the snapshot's own figures
only, no hardcoded names:

```
implied = round(tvl_usd x category_multiple
  x (1 + clamp(change_7d, -60, 100) / 100 x 0.6)
  x (0.55 + 0.45 x min(age_days, 1460) / 1460)
  x (1 + 0.01 x min(chains - 1, 8)))
```

- **Category multiple** — the median market-cap / TVL of the live-token protocols
  in *this same snapshot* that share the row's category, shrunk toward the global
  median (weight n / (n + 6)) and clamped to 0.05–0.60. A category with fewer than
  three live peers uses the global median (0.214 in this snapshot), and peer ratios
  are winsorized at 2.0 so one outlier token cannot set a whole category. The model
  re-derives itself on any future snapshot instead of carrying a hand-kept list.
- **Growth** — the 7-day TVL change, clamped and dampened.
- **Maturity** — age since first listing: how long the protocol has run with no
  token on record. Unknown age uses 365 days.
- **Chain breadth** — up to +8% for protocols live on many chains.

Risk is scored separately from value (sharp 7-day move, unknown or very young
listing, single-chain exposure, thin TVL, missing category) and shown on every
row as Low / Medium / High with its signals, so value and risk sit side by side.

## Coverage

- All **40 watchlist** protocols (TVL ≥ $50M, no token on record, not a wrapped /
  staked / bridged product) — the floor, never the ceiling.
- Plus **138 early protocols** below the floor that pass the watchlist's own
  exclusion rule: pre-token, not a bridge / liquid-staking / CEX product, not a
  versioned pool, not a wrapped or staked product, not an exchange product.
- **178 rows** in total. Protocols whose token already trades are set aside in a
  Live-token view with their market cap — a fact, not a model — and they are the
  peers the category multiples are read from.

## Farm plans

Every row carries a 7-step plan derived from its own category, chains, TVL and
age: a fresh wallet, the category's main action with a stated capital amount, a
second different on-protocol action, a weekly cadence, a hold period (30–90 days
by age), a points-page check that never pays to claim, and a logged, two-half
exit. Each step states its cost and time.

## The dashboard

`dashboard/` is a static page with no network and no framework. It renders the
board from `data.js` (written by `main.ts` from the same board, farm plans
verbatim, so page and `board.json` agree), with:

- a top-3 spotlight, sortable columns (rank, TVL, 7-day growth, age, risk,
  implied value), and filters for search, category, chain, risk, minimum TVL
  and watchlist-only;
- a detail view for every protocol: the full model equation with a recomputed
  check against `board.json`, its risk signals, and its farm plan;
- a Live-token tab and a model panel that states the formula, the peer
  derivation, and the caveats.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Node 22+, standard library only, deterministic: two runs write identical bytes.
`main.ts` reads `/input/snapshot.json` by default, writes `board.json`, `data.js`,
copies `dashboard/` and `screenshots/` to `/output`, and writes `dossier.json`
with the vendored `vendor/makefun-board.ts`.

## Layout

```
main.ts                  entrypoint (Node 22, stdlib only)
lib/model.ts             the radar-2 model, farm plans, snapshot parsing
vendor/makefun-board.ts  make.fun dossier library, byte-for-byte from the kit
dashboard/               index.html, app.css, app.js (no network)
screenshots/             1-board.png (board), 2-detail.png (detail view),
                         3-filtered.png (filtered view)
.makefun/owner.json      claim file: the agent wallet that owns this entry
LICENSE                  MIT
```

## Screenshots

Rendered in headless Chromium at 1440×900 from the built output:
`1-board.png` is the board, `2-detail.png` opens the rank-1 protocol's detail
view, `3-filtered.png` is the board filtered to Lending with TVL $50M+.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bfyeqrq3&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
