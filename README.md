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

## The model (radar-3)

`lib/model.ts` — one function scores every row, from the snapshot's own figures
only, no hardcoded names:

```
log(market cap) = 6.9646 + 0.5223 x log(tvl_usd)   (least squares, 128 live tokens)
implied = round(tvl_usd x size_multiple
  x (1 + clamp(change_7d, -60, 100) / 100 x 0.6)
  x (0.55 + 0.45 x min(age_days, 1460) / 1460)
  x (1 + 0.01 x min(chains - 1, 8)))
```

- **Size curve** — the market-cap / TVL relation is fitted, not assumed: a log-log
  regression over the 128 live-token protocols in *this same snapshot* with a
  market cap and a TVL. The slope is 0.52, so a bigger protocol's token is worth
  more dollars but less per dollar of TVL: the fitted multiple is 0.22 at $50M
  of TVL and 0.05 at $1B. The model re-derives itself on any future snapshot
  instead of carrying a hand-kept list.
- **Growth** — the 7-day TVL change, clamped and dampened.
- **Maturity** — age since first listing: how long the protocol has run with no
  token on record. Unknown age uses 365 days.
- **Chain breadth** — up to +8% for protocols live on many chains.

Risk is scored separately from value (sharp 7-day move, unknown or very young
listing, single-chain exposure, thin TVL, missing category) and shown on every
row as Low / Medium / High with its signals, so value and risk sit side by side.

### The model tests itself

Every run fits the curve, then tests it out of sample and checks its stability —
the dashboard reports the numbers, computed from the same snapshot:

- **Time-split out-of-sample test.** Fit both the old median-ratio model and
  the size curve on the live tokens listed before a cutoff, test on the ones
  listed after it. At the 2024-01-01 split (44 train, 51 test) the curve's
  median log error is 1.07 against 1.64 for the median ratio (median absolute
  error 86% vs 88%, within 2x 37% vs 25%). At the 2023-01-01 split (24 train,
  71 test) it is 1.12 against 1.64 (83% vs 89%, within 2x 31% vs 28%). The
  curve wins on both splits, so the curve is used. A category residual was
  tested the same way and did not survive the time split, so no category
  multiple is used.
- **Bootstrap.** 500 seeded resamples of the 128 live tokens, refit each time:
  slope 5th–95th percentile 0.39–0.66 (median 0.52); fitted multiple at $50M
  of TVL 0.17–0.31, at $1B 0.03–0.09. The curve does not hinge on any one token.
- Market caps are hard to predict from TVL alone, and the errors above are
  honest: the board is a ranking by the fitted curve, not a price forecast.

## Coverage

- All **40 watchlist** protocols (TVL ≥ $50M, no token on record, not a wrapped /
  staked / bridged product) — the floor, never the ceiling.
- Plus **158 early protocols** that pass the watchlist's own exclusion rule, at
  any TVL: 138 below the floor, and 20 above it that the watchlist leaves out
  (the floor is a reporting cut, not a judgement). Excluded: bridges, liquid
  staking / restaking, CEX, versioned pools, wrapped or staked products, and
  exchange products.
- **198 rows** in total. Protocols whose token already trades are set aside in a
  Live-token view with their market cap — a fact, not a model — and they are the
  peers the size curve is fitted on.

## Farm plans

Every row carries an 8-step plan derived from its own category, chains, TVL and
age: a fresh wallet, the category's main action with a stated capital amount, a
second different on-protocol action, a weekly cadence, a hold period (30–90 days
by age), a points-page check that never pays to claim, and a logged, two-half
exit. Each step states its cost and time. The last step nets the plan to the
dollar: gas for its 9 transactions at the main chain's planning rate, 1.5 hours
of the reader's time at $25 an hour, the yield forgone on the capital, the whole
cost all in, and the airdrop it must be worth to break even. The verdict comes
from a stated planning scenario, not a prediction — if the airdrop is 5% of the
implied value shared by 2,000 farmers, the reader's share minus the cost is the
expected net: FARM when it clears $100, THIN when it clears $0, SKIP when it
does not, and a High-risk row never rises above THIN. On this snapshot:
79 FARM, 109 THIN, 10 SKIP.

## The dashboard

`dashboard/` is a static page with no network and no framework. It renders the
board from `data.js` (written by `main.ts` from the same board, farm plans
verbatim, so page and `board.json` agree), with:

- a top-3 spotlight, sortable columns (rank, TVL, 7-day growth, age, risk,
  farm verdict, implied value), and filters for search, category, chain, risk,
  minimum TVL and watchlist-only;
- a detail view for every protocol: the full model equation with a recomputed
  check against `board.json`, its risk signals, its farm economics (costs,
  break-even, scenario net, verdict), and its farm plan;
- a Live-token tab and a model panel that states the formula, the out-of-sample
  test, the bootstrap stability, the farm-economics assumptions, and the caveats.

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
lib/model.ts             the radar-3 model, farm plans, snapshot parsing
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
