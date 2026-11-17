# Token Radar — validation log

## v4 (17 Nov 2026): why v3 failed on the site, and the fix

### The cause — v3's screenshots were 1440x708, under the gate's 800px short side

v3 (submission 01a1e9dd-2f98-7512-85ed-61f1b7b59b57) graded on the site as
rank 10,092/10,095, `compliant=false`, `valid 0`, reason `failed_tests`.
The local kit check passed 13/13 and two local runs were byte-identical —
because the local check never runs the sealed gate. The sealed gate
(RULES.txt, "The gate") has seven rows; I reimplemented all seven from the
rules and ran them against a fresh v3 output:

| row | v3 result |
|---|---|
| dashboard_files | PASS (3 files, 43,774 bytes, no http(s)) |
| board_file | PASS (198 rows, all slugs real, ranks/implied whole+positive) |
| sorted_by_value | PASS (ranks 1..198, top $41,022,774, bottom $2,136,345) |
| coverage | PASS (all 40 watchlist slugs present) |
| farm_steps | PASS (all rows 3..12 steps, 20..600 chars) |
| **screenshots** | **FAIL — 1-board.png, 2-detail.png, 3-filtered.png are all 1440x708** |
| dossier_matches | PASS (byte-identical rebuild, 882,034 bytes) |

The gate requires each screenshot's long side at most 1440 and its **short
side at least 800 pixels**. 708 < 800, so the screenshots row failed, the
entry was invalid (`valid 0`), and it never reached the judge — hence
`failed_tests` and a null judge score. v2's screenshots were 1440x900
(verified from git history, commit dd403e6) and v2 passed the gate; v3's
were 1440x708 (verified from commit a8eb61b and with `file`). The README
already said "Rendered in headless Chromium at 1440×900" — the claim was
wrong; the files were not.

How it happened: the v3 shot script (`~/workspace/makefun/dev/shot-radar.mjs`)
passed `--window-size=1440,900` to headless Chrome (`--headless=new`) and
captured with no clip. In headless=new that flag does **not** set the
viewport — the capture came out 1440x708 — and nothing checked the
dimensions afterwards, so the bad size shipped silently.

### The fix (v4)

- **Screenshots regenerated at exactly 1440x900** with a fixed script
  (`~/workspace/makefun/dev/shot-radar-v4.mjs`): the viewport is set with
  `Emulation.setDeviceMetricsOverride` (1440x900, scale 1), the capture is
  clipped to 1440x900, and each PNG's IHDR dimensions are read back —
  the script aborts unless they are exactly 1440x900. New files:
  1-board.png 255,160 bytes, 2-detail.png 236,297 bytes,
  3-filtered.png 256,287 bytes (all < 512 KiB). All three were visually
  inspected: board (top 3 cards, filters, sortable table), detail dialog
  (Steakhouse Financial, implied $41.0M, FARM net $985 — agrees with
  board.json), filtered view (Category Lending, TVL $50M+, 4 of 198 rows).
- **Model hardening (defense in depth, not the cause).** The sealed
  snapshot is the kit snapshot, so the snapshot hypothesis was tested and
  rejected — but the adversarial tests below found real fragility, fixed
  in `lib/model.ts` with guards that only fire on degenerate data:
  - `sizeMultiple`: TVL clamped to >= $1, so `log(<=0)` can never make
    an implied value NaN.
  - `fitSizeCurve`: with no peer to fit on, a flat 0.5x curve
    (`log(mcap) = log(0.5) + log(TVL)`) instead of an OLS over empty
    arrays (which gave intercept NaN).
  - `ols` / `median` / `pooledWalkForward`: empty-input guards returning
    0 / zeros instead of NaN.
  - `impliedValue`: a non-finite product becomes 1, never NaN.
  - `boardIssue`: refuses boards under 100 rows (an empty snapshot used
    to pass the check and write a 0-row board).

### Adversarial snapshot tests (v4, all 13 cases)

| case | v3 | v4 |
|---|---|---|
| kit snapshot (baseline) | 198 rows, no issue | 198 rows, no issue — identical |
| watchlist TVL = 0 | implied NaN → run exits 1 | valid board, no issue |
| watchlist TVL negative | implied NaN → run exits 1 | valid board, no issue |
| watchlist TVL missing | SnapshotError (malformed input — correct) | same, correct refusal |
| all mcap null (no peers) | curve (NaN, 0), implied NaN | valid 442-row board, fallback 0.5x curve |
| one peer only | valid (degenerate slope 0) | valid, unchanged |
| all TVL equal | valid | valid, unchanged |
| trimmed peers < 15 | fallback to all peers | same, unchanged |
| watchlist slug missing | boardIssue refuses (correct) | same, correct refusal |
| empty snapshot | 0-row board written | boardIssue refuses (< 100 rows) |
| all change_7d null | valid | valid, unchanged |
| all chains empty | valid | valid, unchanged |
| all categories null | 40 rows (watchlist only) | refused (< 100 rows) — correct |
| all listed_at null | valid | valid, unchanged |

### Verification (v4, kit snapshot)

- **Gate checker (all seven RULES rows, reimplemented): 7/7 PASS.**
  Dossier 1,042,194 bytes (< 1.5 MiB), byte-identical rebuild.
- **Determinism:** two runs byte-identical (`diff -r` clean).
- **v3 vs v4 numbers, identical** (guards never fire on the kit snapshot):
  curve log(mcap) = 8.9978 + 0.4049·log(TVL), 94/128 peers, trimmed.
  OOS 2024 median log error 0.8250 (within-2x 45.1%), OOS 2023 1.1440
  (31.0%). Walk-forward pooled curve: mean log error 1.5490, median
  1.1533, within-2x 35.2%, Spearman 0.309, n=88 (ratio model 1.7211 /
  1.6611 / 28.4%). Bootstrap slope p5/p50/p95 = 0.2263/0.4113/0.5870.
  Board 198 rows, 88 FARM / 102 THIN / 8 SKIP, top1 Steakhouse Financial
  $41,022,774. Runtime ~0.4s per run (site budget 120s).
- **What v4 does not change:** the model, the board, the dossier text,
  and the dashboard are the same numbers as v3 — only the screenshots
  (the failing row) and the degenerate-data guards are new. The v4 output
  is byte-identical to the v3 output except for the screenshots and the
  dossier that embeds them.

## v3 (17 Nov 2026): radar-4

Model radar-4: size curve `log(mcap) = 8.9978 + 0.4049·log(TVL)` fitted on
94 comparable live protocols (categories CEX, Bridge, Canonical Bridge,
Liquid Staking, Liquid Restaking, Restaked BTC trimmed; fallback to 128
peers if the trimmed set has fewer than 15). Selected by walk-forward
(5 expanding windows by listing year, 88 dated tokens each tested once).
See README.md "The model (radar-4)" and the dashboard's walk-forward panel
for the full numbers and what was tested and rejected.
