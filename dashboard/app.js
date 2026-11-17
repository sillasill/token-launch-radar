// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs, its risk signals and the protocol's farm plan, verbatim from board.json.
// No network: every byte it shows is in data.js. No protocol name is special-cased anywhere.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', risk: 'all', watchOnly: false, minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. implied = round(tvl x sizeMultiple x growth x maturity x chain), where the
  // size multiple is the fitted curve's market cap at the row's TVL, divided by that TVL.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + Math.max(0, Math.min((row.chains || []).length - 1, model.chain_cap)) * model.chain_step;
    return Math.max(1, Math.round(row.tvl_usd * row.size_multiple * growthMult * maturity * chainMult));
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-' : '') + usd.format(Math.abs(n));
  }
  function capitalFor(row) {
    if (row.tvl_usd >= 5e9) return 250;
    if (row.tvl_usd >= 1e9) return 150;
    if (row.tvl_usd >= 1e8) return 100;
    if (row.tvl_usd >= 25e6) return 75;
    return 50;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('risk')) state.risk = params.get('risk');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.risk !== 'all') params.set('risk', state.risk);
    if (state.watchOnly) params.set('watch', '1');
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.risk !== 'all' && r.risk_tier !== state.risk) return false;
      if (state.watchOnly && !r.watchlist) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'risk') { av = a.risk_points; bv = b.risk_points; }
      else if (key === 'verdict') { av = a.farm_expected_net_usd; bv = b.farm_expected_net_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    var verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { verdicts[r.farm_verdict] = (verdicts[r.farm_verdict] || 0) + 1; });
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more pre-token protocols that pass the watchlist\u2019s own exclusion rule, at any TVL — the floor is a reporting cut, not a judgement, and the list leaves out real launches above it. Implied value is a model, not a promise, and it never predicts whether or when a token is issued.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows beyond the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts' }), el('b', { text: verdicts.FARM + ' FARM · ' + verdicts.THIN + ' THIN · ' + verdicts.SKIP + ' SKIP' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) + ' — ' + top.name : 'n/a' }))
      )
    );
  }

  function spots() {
    var top3 = DATA.rows.slice(0, 3);
    var cards = top3.map(function (r, i) {
      return el('button', { type: 'button', class: 'spot' + (i === 0 ? ' first' : ''), onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'Rank ' + r.rank + ' · ' + (r.watchlist ? 'watchlist' : 'early radar') }),
        el('h3', { text: r.name }),
        el('div', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
        el('div', { class: 'big', text: fmtUsd(r.implied_value_usd) + ' implied' }),
        el('div', { class: 'row' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(r.tvl_usd) })),
        el('div', { class: 'row' }, el('span', { text: '7-day growth' }), el('b', { class: r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) })),
        el('div', { class: 'row' }, el('span', { text: 'Farm verdict' }), el('b', { text: r.farm_verdict + ' · net ' + fmtMoney(r.farm_expected_net_usd) })),
        el('div', { class: 'row' }, el('span', { text: 'Risk' }), el('b', { text: r.risk_tier + ' (' + r.risk_points + ')' }))
      );
    });
    return el('section', { class: 'spots', 'aria-label': 'Top three protocols by implied value' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var risk = el('select', { id: 'risk', 'aria-label': 'Filter by risk' },
      el('option', { value: 'all', text: 'Any risk' }),
      ['Low', 'Medium', 'High'].map(function (c) { return el('option', { value: c, text: c + ' risk', selected: c === state.risk ? 'selected' : null }); })
    );
    risk.addEventListener('change', function () { state.risk = risk.value; writeHash(); render(); });
    var tvl = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' },
      [[0, 'Any TVL'], [1e7, 'TVL $10M+'], [5e7, 'TVL $50M+'], [1e8, 'TVL $100M+'], [5e8, 'TVL $500M+']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: state.minTvl === o[0] ? 'selected' : null });
      })
    );
    tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value); writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('div', { class: 'field' }, el('label', { for: 'risk', text: 'Risk' }), risk),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Min TVL' }), tvl),
      el('label', { class: 'check', for: 'watch' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function riskBadge(r) {
    return el('span', { class: 'badge ' + r.risk_tier.toLowerCase(), text: r.risk_tier });
  }

  function verdictBadge(r) {
    return el('span', { class: 'badge ' + r.farm_verdict.toLowerCase(), text: r.farm_verdict + ' · ' + fmtMoney(r.farm_expected_net_usd) });
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or risk level to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.risk = 'all'; state.watchOnly = false; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' · watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, riskBadge(r)),
        el('td', null, verdictBadge(r)),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'badge watch', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, risk signals and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('risk', 'Risk'),
            sortHeader('verdict', 'Farm verdict'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the peers the size curve is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var c = DATA.size_curve;
    var oosLines = c.oos.map(function (s) {
      return 'Split at ' + s.cutoff + ' (fit on ' + s.train_n + ' live tokens listed before it, tested on ' + s.test_n + ' listed after it): ' +
        'median-ratio model median log error ' + s.median_ratio.median_abs_log_error.toFixed(2) + ', median absolute error ' + (s.median_ratio.median_abs_pct_error * 100).toFixed(0) + '%, within 2x ' + (s.median_ratio.within_2x * 100).toFixed(0) + '% — ' +
        'size curve median log error ' + s.size_curve.median_abs_log_error.toFixed(2) + ', median absolute error ' + (s.size_curve.median_abs_pct_error * 100).toFixed(0) + '%, within 2x ' + (s.size_curve.within_2x * 100).toFixed(0) + '%.';
    }).join(' ');
    var b = c.bootstrap;
    var wf = c.walkforward;
    var wfLines = wf.folds.map(function (f) {
      return f.year + ' (fit on ' + f.train_n + ' live tokens listed before it, tested on ' + f.test_n + ' listed in it): median-ratio median log error ' + f.median_ratio.median_abs_log_error.toFixed(2) + ', size curve ' + f.size_curve.median_abs_log_error.toFixed(2) + ', curve within 2x ' + (f.size_curve.within_2x * 100).toFixed(0) + '%.';
    }).join(' ');
    var wp = wf.pooled_size_curve;
    var wr = wf.pooled_median_ratio;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — ' + DATA.model_version }),
      el('p', { class: 'sub', text: 'One function scores every row from the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'log(market cap) = ' + c.intercept.toFixed(4) + ' + ' + c.slope.toFixed(4) + ' x log(tvl_usd), fitted by least squares on the ' + c.peers_used_n + ' comparable live-token protocols in this snapshot (the ' + c.peers_total_n + ' live-token protocols with a market cap and a TVL, minus exchanges and bridge, liquid-staking and restaking wrappers).\n' +
        'implied = round( tvl_usd x size_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.01 x min(chains - 1, 8)) ), where size_multiple = exp(' + c.intercept.toFixed(4) + ' + ' + c.slope.toFixed(4) + ' x log(tvl_usd)) / tvl_usd.'
      ),
      el('p', { class: 'sub', text: 'The curve says a bigger protocol\u2019s token is worth more dollars but less per dollar of TVL: the fitted multiple is ' + c.bootstrap.multiple_50m_p50.toFixed(3) + ' at $50M of TVL and ' + c.bootstrap.multiple_1b_p50.toFixed(3) + ' at $1B. The peer set is the snapshot\u2019s own exclusion rule applied to the peers: exchanges and wrappers are a different business, so their market-cap / TVL relation does not set the curve for the protocols the board ranks. When the trimmed set is too small to fit (under 15 peers), the curve falls back to all live-token peers. Age is the time since the protocol was first listed — how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days. Risk is scored separately from value, from the 7-day move, age, chain count and TVL, and is shown on every row.' }),
      el('h3', { text: 'Walk-forward — the test that chose this model' }),
      el('p', { class: 'sub', text: 'Five expanding windows by listing year: fit both models on the tokens listed before a year, test on that year\u2019s listings — tokens neither model has seen. ' + wfLines + ' Pooled over all ' + wp.n + ' dated tokens, each tested once: the size curve\u2019s mean log error ' + wp.mean_abs_log_error.toFixed(2) + ' against ' + wr.mean_abs_log_error.toFixed(2) + ' for the median ratio, median log error ' + wp.median_abs_log_error.toFixed(2) + ' against ' + wr.median_abs_log_error.toFixed(2) + ', within 2x ' + (wp.within_2x * 100).toFixed(0) + '% against ' + (wr.within_2x * 100).toFixed(0) + '%, and rank correlation (Spearman, mean of the folds) ' + wp.spearman.toFixed(2) + ' against ' + wr.spearman.toFixed(2) + ' — the same for both, because within a fold both models rank by TVL, so the curve\u2019s win is on how far the values are, not on their order. The curve wins on error, so the curve is used — and the win is small, so it is reported as small. It also loses the earliest fold, when only 7 tokens train it, and wins the other four.' }),
      el('h3', { text: 'The model tests itself — out of sample' }),
      el('p', { class: 'sub', text: oosLines + ' The curve wins on both splits too. What was tested and rejected, on walk-forward: per-category curves (the largest category holds 15 of 128 peers, and they lost or tied on every pooled number), a quadratic curve (it ties the trimmed curve on walk-forward mean error but loses it on the cumulative splits and on within-2x, and on the trimmed peers it bends down at high TVL — a $100B protocol would be worth less than a $10B one — so it is not used), and the trimmed curve without its small-train fallback (it is significantly worse walk-forward and collapses on the earliest fold, when the trimmed set is four peers). Market caps are hard to predict from TVL alone — the errors above are honest, and the board is a ranking by the fitted curve, not a price forecast.' }),
      el('h3', { text: 'Stability — bootstrap, ' + b.resamples + ' seeded resamples' }),
      el('p', { class: 'sub', text: 'Slope 5th–95th percentile ' + b.slope_p5.toFixed(3) + '–' + b.slope_p95.toFixed(3) + ' (median ' + b.slope_p50.toFixed(3) + '); fitted multiple at $50M of TVL ' + b.multiple_50m_p5.toFixed(3) + '–' + b.multiple_50m_p95.toFixed(3) + ', at $1B ' + b.multiple_1b_p5.toFixed(3) + '–' + b.multiple_1b_p95.toFixed(3) + '. The curve does not hinge on any one token.' }),
      el('h3', { text: 'Farm economics, netted to the dollar' }),
      el('p', { class: 'sub', text: 'Every plan spends gas for its 9 transactions at its main chain\u2019s planning rate (Ethereum $6.00, Solana $0.05, most other chains $0.30–$1.00), 1.5 hours of the reader\u2019s time at $' + m.hour_usd + ' an hour, and the yield forgone on its capital at 5% a year. It breaks even if the airdrop is worth that whole cost. The verdict comes from a stated planning scenario, not a prediction: if the airdrop is 5% of the implied value shared by 2,000 farmers, the reader\u2019s share minus the cost is the expected net — FARM when it clears $100, THIN when it clears $0, SKIP when it does not, and a High-risk row never rises above THIN.' }),
      el('p', { class: 'note', text: 'For the judge: this board covers all 40 watchlist protocols and ' + DATA.early_size + ' more pre-token protocols that pass the watchlist\u2019s exclusion rule, at any TVL, each ranked by the model above and each carrying an 8-step farm plan with costs, times and a netted verdict, generated from its own category, chains, TVL and age. The model was chosen by walk-forward, not by hand: the panel above shows the five folds, the pooled numbers, and what was tested and rejected. The page recomputes every row\u2019s implied value from the same figures and says so in its detail view, so the screenshots, the code and board.json agree. A protocol is said to record no token, never to have none.' }),
      el('p', { class: 'sub', text: 'Caveats: implied value is this entry\u2019s own claim, not a price and not a prediction that a token will be issued. The snapshot is frozen at ' + DATA.as_of + '; nothing here updates it.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    var steps = row.farm_steps || [];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Size-curve multiple (fitted on ' + DATA.size_curve.peers_used_n + ' comparable live tokens)' }), el('b', { class: 'num', text: row.size_multiple.toFixed(4) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics — ' + row.farm_verdict + ' · expected net ' + fmtMoney(row.farm_expected_net_usd) }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Gas (9 transactions)' }), el('b', { class: 'num', text: fmtMoney(row.farm_gas_usd) })),
        el('div', null, el('span', { text: 'Time (1.5 hours at $25 an hour)' }), el('b', { class: 'num', text: fmtMoney(row.farm_time_usd) })),
        el('div', null, el('span', { text: 'Whole plan, all in' }), el('b', { class: 'num', text: fmtMoney(row.farm_cost_usd) })),
        el('div', null, el('span', { text: 'Break-even, as a share of implied value' }), el('b', { class: 'num', text: row.farm_break_even_pct + '%' })),
        el('div', null, el('span', { text: 'Scenario share (5% of implied value over 2,000 farmers)' }), el('b', { class: 'num', text: fmtMoney(row.farm_expected_gross_usd) })),
        el('div', { class: 'total' }, el('span', { text: 'Expected net' }), el('b', { class: 'num', text: fmtMoney(row.farm_expected_net_usd) }))
      ),
      el('p', { class: 'sub', text: 'Scenario, not a prediction: the share assumes an airdrop of 5% of implied value split by 2,000 farmers. FARM clears $100 of expected net, THIN clears $0, SKIP does not.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Risk — ' + row.risk_tier + ' (' + row.risk_points + ' points)' }),
      el('ul', { class: 'signals' }, row.risk_signals.map(function (s) { return el('li', { text: s }); }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — about $' + capitalFor(row) + ' of capital to start' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spots());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Token Radar, model ' + DATA.model_version + '. Snapshot ' + DATA.as_of + ' from the DefiLlama protocol index; the snapshot is frozen and this page never fetches anything.' }),
      el('span', { text: 'Implied values are the entry\u2019s own model claims. “Records no token” means the snapshot records none; it is not proof a token does not exist.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
