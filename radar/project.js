/* ── Chain metadata ────────────────────────────────────────────── */
// Icons from DefiLlama chainlist: https://icons.llamao.fi/icons/chains/rsz_<slug>.jpg
const CHAIN_META = {
  'skale-nebula':  { slug: 'skale',    label: 'S' },
  'somnia':        { slug: 'somnia',   label: 'So' },
  'polygon':       { slug: 'polygon',  label: 'P' },
  'aurora':        { slug: 'aurora',   label: 'A' },
  'ethereum':      { slug: 'ethereum', label: 'E' },
};

function chainIconUrl(chain) {
  const meta = CHAIN_META[chain];
  if (!meta) return null;
  return `https://icons.llamao.fi/icons/chains/rsz_${meta.slug}.jpg`;
}

/* ── Helpers ───────────────────────────────────────────────────── */
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts * 1000) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortHash(h) {
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function formatNum(n) {
  if (n === null || n === undefined) return '--';
  return Number(n).toLocaleString();
}

/* ── DOM helpers ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Chain filter widget ───────────────────────────────────────── */
function chainImgTag(chain, size = 20) {
  const url = chainIconUrl(chain);
  const meta = CHAIN_META[chain] || { label: chain.slice(0, 2).toUpperCase() };
  if (url) {
    return `<img class="cf-chain-chip" src="${url}" title="${chain}" width="${size}" height="${size}"
      style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(255,255,255,0.15)"
      onerror="this.outerHTML='<span class=\\'cf-chain-chip\\'>${meta.label}</span>'">`;
  }
  return `<span class="cf-chain-chip" title="${chain}">${meta.label}</span>`;
}

function buildChainFilter(containerId, chains, onSelect) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = '';
  el.classList.add('chain-filter-bar');

  const makeBtn = (label, chain, imgUrl) => {
    const btn = document.createElement('button');
    btn.className = 'cfb' + (chain === null ? ' active' : '');
    btn.dataset.chain = chain ?? '';
    if (imgUrl) {
      const img = document.createElement('img');
      img.src = imgUrl;
      img.width = img.height = 16;
      img.style.cssText = 'border-radius:50%;object-fit:cover;flex-shrink:0';
      img.onerror = () => img.remove();
      btn.appendChild(img);
    }
    const txt = document.createTextNode(label);
    btn.appendChild(txt);
    btn.addEventListener('click', () => {
      el.querySelectorAll('.cfb').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(chain);
    });
    return btn;
  };

  el.appendChild(makeBtn('All', null, null));
  chains.forEach(c => {
    const meta = CHAIN_META[c] || { label: c.slice(0, 3).toUpperCase() };
    el.appendChild(makeBtn(meta.label, c, chainIconUrl(c)));
  });
}

/* ── Last-update footer ────────────────────────────────────────── */
const CLOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

function _renderFooterTime(el) {
  const isoStr = el.dataset.lastUpdated;
  if (!isoStr) return;
  const mins = Math.round((Date.now() - new Date(isoStr)) / 60000);
  const label = mins < 1 ? 'just now' : mins < 60 ? `${mins} minute${mins === 1 ? '' : 's'} ago` : `${Math.round(mins / 60)} hours ago`;
  el.innerHTML = `${CLOCK_SVG} ${label}`;
}

function setFooterTime(id, isoStr) {
  const el = $(id);
  if (!el) return;
  if (!isoStr) { el.innerHTML = `${CLOCK_SVG} No data yet`; return; }
  el.dataset.lastUpdated = isoStr;
  _renderFooterTime(el);
}

// Tick all footer-time elements every 60 s so the label stays current.
setInterval(() => {
  document.querySelectorAll('.footer-time[data-last-updated]').forEach(_renderFooterTime);
}, 60000);

/* ── Build chart data from recentTxs ───────────────────────────── */
function buildDayBuckets(allTxs, days) {
  const buckets = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    buckets[d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = 0;
  }
  const cutoff = (now / 1000) - days * 86400;
  allTxs.forEach(tx => {
    if (tx.timeStamp >= cutoff) {
      const d = new Date(tx.timeStamp * 1000);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (label in buckets) buckets[label]++;
    }
  });
  return { labels: Object.keys(buckets), data: Object.values(buckets) };
}

/* ── Lightbox ──────────────────────────────────────────────────── */
let _openLightbox = null;

function initLightbox() {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <div class="lightbox-inner">
      <button class="lightbox-close" aria-label="Close">&#x2715;</button>
      <div class="lightbox-content"></div>
    </div>`;
  document.body.appendChild(overlay);

  const inner   = overlay.querySelector('.lightbox-inner');
  const content = overlay.querySelector('.lightbox-content');

  function closeLb() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { content.innerHTML = ''; }, 220);
  }

  overlay.querySelector('.lightbox-close').addEventListener('click', closeLb);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeLb(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeLb();
  });

  _openLightbox = html => {
    content.innerHTML = html;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
}

/* ── Chart instance ────────────────────────────────────────────── */
let chartInstance = null;

function renderChart(allTxs, days) {
  const canvas = $('activity-chart');
  if (!canvas) return;
  const { labels, data } = buildDayBuckets(allTxs, days);

  const uawLine = data.map(v => Math.round(v * 0.6));

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  chartInstance = new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Transactions',
          data,
          backgroundColor: 'rgba(45,212,191,0.7)',
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'yTx',
        },
        {
          type: 'line',
          label: 'UAW',
          data: uawLine,
          borderColor: '#e2e8f0',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          yAxisID: 'yTx',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#8b9cbf',
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b9cbf', font: { size: 11 }, maxTicksLimit: 8 },
        },
        yTx: {
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b9cbf', font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

/* ── Period stats from recentTxs ───────────────────────────────── */
function countTxsForPeriod(allTxs, hours) {
  const cutoff = Date.now() / 1000 - hours * 3600;
  return allTxs.filter(tx => tx.timeStamp >= cutoff).length;
}

/* ── Twitter / X news feed ─────────────────────────────────────── */
function renderTwitterFeed(proj) {
  const container = $('twitter-feed');
  if (!container || container.dataset.loaded) return;
  container.dataset.loaded = 'true';

  // Extract handle from socials.twitter URL
  const twitterUrl = proj.socials?.twitter || '';
  const handle = twitterUrl.split('/').filter(Boolean).pop() || '';

  if (!handle) {
    container.innerHTML = `<div class="tab-placeholder" style="padding:2rem 0">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:32px;height:32px;opacity:.3"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      No X account configured
    </div>`;
    return;
  }

  container.innerHTML = `
    <div class="twitter-header">
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      Latest from <strong>@${handle}</strong>
    </div>
    <a class="twitter-timeline"
       data-tweet-limit="3"
       data-theme="dark"
       data-chrome="noheader nofooter noborders transparent"
       data-border-color="#1f2937"
       href="https://twitter.com/${handle}">
    </a>`;

  if (!document.querySelector('script[src*="platform.twitter.com"]')) {
    const s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    document.body.appendChild(s);
  } else if (window.twttr?.widgets) {
    window.twttr.widgets.load(container);
  }
}

/* ── Main init ─────────────────────────────────────────────────── */
async function initDashboard() {
  const proj = await fetch('./data.json').then(r => r.json());

  /* ── Breadcrumb + title ── */
  document.title = `${proj.name} – Onchain Radar`;
  const bcEl = $('bc-current');
  if (bcEl) bcEl.textContent = proj.name;

  /* ── Logo ── */
  const logo = $('project-logo');
  logo.src = proj.logo || '';
  logo.alt = proj.name;
  logo.onerror = () => {
    logo.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><rect width='88' height='88' fill='%23161b27'/></svg>`;
  };

  /* ── Title + desc ── */
  $('project-title').textContent = proj.name;
  const descEl = $('project-desc');
  const SHORT = 120;
  if (proj.description && proj.description.length > SHORT) {
    descEl.innerHTML = `${proj.description.slice(0, SHORT)}&hellip; <a class="read-more" onclick="document.getElementById('about-section').scrollIntoView({behavior:'smooth'});return false;" href="#">Read more</a>`;
  } else {
    descEl.textContent = proj.description || '';
  }

  /* ── Chain badges ── */
  const chains = [...new Set((proj.contracts || []).map(c => c.chain))];
  const badgesEl = $('chain-badges');
  badgesEl.innerHTML = chains.slice(0, 4).map(c => chainImgTag(c, 26)).join('');
  if (chains.length > 4) {
    badgesEl.innerHTML += `<span class="chain-more">+${chains.length - 4}</span>`;
  }

  /* ── Rank badge (static fallback; updated dynamically after stats load) ── */
  const rankEl = $('proj-rank');
  if (rankEl && proj.rank) rankEl.textContent = proj.rank;

  /* ── Overview: video + screenshots ── */
  const sg = $('screenshots-grid');
  if (sg) {
    let html = '';
    // Video thumb first
    if (proj.video) {
      const ytId = proj.video.match(/[?&]v=([^&]+)/)?.[1] || proj.video.split('/').pop();
      html += `
        <div class="screenshot-item video-item">
          <img src="https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg"
               onerror="this.src='https://i.ytimg.com/vi/${ytId}/hqdefault.jpg'" loading="lazy" />
          <a href="${proj.video}" target="_blank" class="play-btn" aria-label="Play video">
            <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd"
                d="M20 40c11.046 0 20-8.954 20-20S31.046 0 20 0 0 8.954 0 20s8.954 20 20 20Zm-1.113-27.08A2.5 2.5 0 0 0 15 15v10a2.5 2.5 0 0 0 3.887 2.08l7.5-5a2.5 2.5 0 0 0 0-4.16l-7.5-5Z"/>
            </svg>
          </a>
        </div>`;
    }
    // Screenshots
    (proj.screenshots || []).forEach(url => {
      html += `<div class="screenshot-item"><img src="${url}" loading="lazy" /></div>`;
    });
    // Placeholders if nothing
    if (!html) {
      html = Array(3).fill(`<div class="screenshot-item"><div class="screenshot-placeholder">🎮</div></div>`).join('');
    }
    sg.innerHTML = html;

    // Wire video play button → lightbox YouTube embed
    const playBtn = sg.querySelector('.play-btn');
    if (playBtn && proj.video) {
      const ytId = proj.video.match(/[?&]v=([^&]+)/)?.[1] || proj.video.split('/').pop();
      playBtn.addEventListener('click', e => {
        e.preventDefault();
        if (_openLightbox) {
          _openLightbox(`<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0"
            frameborder="0"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowfullscreen></iframe>`);
        }
      });
      playBtn.removeAttribute('href');
      playBtn.removeAttribute('target');
    }

    // Wire screenshot items → lightbox image view
    sg.querySelectorAll('.screenshot-item:not(.video-item)').forEach(item => {
      const img = item.querySelector('img');
      if (!img) return;
      item.style.cursor = 'zoom-in';
      item.addEventListener('click', () => {
        if (_openLightbox) _openLightbox(`<img src="${img.src}" alt="Screenshot" />`);
      });
    });
  }

  /* ── Tab switching ── */
  function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
    $(`panel-${tabName}`)?.classList.add('active');

    if (tabName === 'news') renderTwitterFeed(proj);
    if (tabName === 'about-scroll') {
      $('about-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ── Details panel (About tab) ── */
  const fmtTs = ts => ts
    ? new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '--';

  const dtTitle = $('details-title');
  if (dtTitle) dtTitle.textContent = `${proj.name} details`;
  const detUrl = $('detail-url');
  if (detUrl) {
    detUrl.href = proj.url || '#';
    $('detail-url-text').textContent = (proj.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  if ($('detail-listed'))  $('detail-listed').textContent  = fmtTs(proj.listedOn);
  if ($('detail-updated')) $('detail-updated').textContent = fmtTs(proj.lastUpdated);
  if ($('detail-dappid'))  $('detail-dappid').innerHTML    = proj.dappId != null
    ? `${proj.dappId} <span style="opacity:0.5;font-size:0.85em">©</span>` : '--';

  /* ── Sidebar: Open dapp ── */
  const odBtn = $('open-dapp-btn');
  if (odBtn) odBtn.href = proj.url || '#';

  /* ── Sidebar: Socials ── */
  const sl = $('socials-list');
  if (sl && proj.socials) {
    const icons = {
      telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.018 9.51c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.37 14.493l-2.95-.924c-.64-.203-.654-.64.136-.948l11.532-4.448c.533-.194 1.0.131.474.075z"/></svg>`,
      twitter:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
      medium:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/></svg>`,
      discord:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.079.11 18.1.13 18.115a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`,
    };
    const links = Object.entries(proj.socials)
      .filter(([, url]) => url)
      .map(([net, url]) => `<a class="social-icon" href="${url}" target="_blank" title="${net}">${icons[net] || net}</a>`);
    sl.innerHTML = links.join('') || '<span style="color:var(--text-muted);font-size:0.8rem">No socials added</span>';
  }

  /* ── Section labels ── */
  ['stats-proj-label', 'chart-proj-label'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = proj.name;
  });

  /* ── Load stats files + UAW ── */
  let allTxs = [];
  let lastUpdated = null;
  // per-chain totals: { chain: { total, last24h, daily: {'YYYY-MM-DD': count} } }
  const chainStats = {};

  // Global daily map across all chains: { 'YYYY-MM-DD': count }
  const globalDaily = {};

  const addDaily = (target, dailyCounts) => {
    for (const { date, count } of (dailyCounts || [])) {
      target[date] = (target[date] || 0) + count;
    }
  };

  await Promise.all((proj.contracts || []).map(async c => {
    try {
      const r = await fetch(`./stats/${c.chain}_${c.address.toLowerCase()}.json?t=${Date.now()}`);
      if (!r.ok) return;
      const s = await r.json();
      if (!chainStats[c.chain]) chainStats[c.chain] = { total: 0, last24h: 0, daily: {} };
      chainStats[c.chain].total   += s.total   || 0;
      chainStats[c.chain].last24h += s.last24h || 0;
      addDaily(chainStats[c.chain].daily, s.dailyCounts);
      addDaily(globalDaily, s.dailyCounts);
      if (s.lastUpdated && (!lastUpdated || s.lastUpdated > lastUpdated)) lastUpdated = s.lastUpdated;
      (s.recentTxs || []).forEach(tx => allTxs.push({ ...tx, chain: c.chain, contractAddress: c.address }));
    } catch { /* no data yet */ }
  }));

  allTxs.sort((a, b) => b.timeStamp - a.timeStamp);

  // Real UAW from scanner-computed uaw.json
  let uawData = null;
  try {
    const r = await fetch(`./uaw.json?t=${Date.now()}`);
    if (r.ok) uawData = await r.json();
  } catch { /* no uaw data yet */ }

  /* ── Dynamic rank from ranking.json ── */
  try {
    const ranking = await fetch('../ranking.json?t=' + Date.now()).then(r => r.ok ? r.json() : null);
    if (ranking && rankEl) {
      const myTotal = Object.values(chainStats).reduce((s, v) => s + v.total, 0);
      const category = proj.category || 'Games';
      // Merge fresh total for the current project before sorting
      const list = ranking.map(p => p.name === proj.name ? { ...p, totalTxs: myTotal } : p);
      // Rank highest-txs first within the same category
      const peers = list.filter(p => p.category === category).sort((a, b) => b.totalTxs - a.totalTxs);
      const myRank = peers.findIndex(p => p.name === proj.name) + 1;
      if (myRank > 0) rankEl.textContent = `#${myRank} in ${category}`;
    }
  } catch { /* keep static fallback from data.json */ }

  /* ── Active filters ── */
  let activeStatsChain  = null;   // null = All
  let activeChartChain  = null;
  let activeStatsPeriod = '24h';
  let activeChartDays   = 7;

  function filteredTxs(chain) {
    return chain ? allTxs.filter(tx => tx.chain === chain) : allTxs;
  }

  function totalFor(chain) {
    if (!chain) return Object.values(chainStats).reduce((s, v) => s + v.total, 0);
    return chainStats[chain]?.total || 0;
  }

  function last24hFor(chain) {
    if (!chain) return Object.values(chainStats).reduce((s, v) => s + v.last24h, 0);
    return chainStats[chain]?.last24h || 0;
  }

  /** Sum daily counts for the last N days from a daily map { 'YYYY-MM-DD': count } */
  function sumDays(dailyMap, n) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      total += dailyMap[d.toISOString().slice(0, 10)] || 0;
    }
    return total;
  }

  function txsForPeriod(period, chain) {
    const daily = chain ? (chainStats[chain]?.daily || {}) : globalDaily;
    if (period === '24h')  return last24hFor(chain);
    if (period === '7d')   return sumDays(daily, 7);
    if (period === '30d')  return sumDays(daily, 30);
    return totalFor(chain);
  }

  function uawFor(period, chain) {
    if (!uawData) return '--';
    // Use per-chain breakdown when a specific chain is selected
    const src = (chain && uawData.byChain?.[chain]) ? uawData.byChain[chain] : uawData;
    if (period === '24h') return src.uaw24h  ?? 0;
    if (period === '7d')  return src.uaw7d   ?? 0;
    if (period === '30d') return src.uaw30d  ?? 0;
    return src.uawAlltime ?? 0;
  }

  /* ── Stats section ── */
  function applyPeriodStats(period) {
    activeStatsPeriod = period;
    const txCount = txsForPeriod(period, activeStatsChain);
    $('stat-txs').textContent = formatNum(txCount);
    $('stat-uaw').textContent = formatNum(uawFor(period, activeStatsChain));
  }

  applyPeriodStats('24h');

  document.querySelectorAll('#stats-time-tabs .ttab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#stats-time-tabs .ttab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyPeriodStats(btn.dataset.period);
    });
  });

  setFooterTime('stats-last-update', lastUpdated);
  setFooterTime('chart-last-update', lastUpdated);

  /* ── Chain filters (wired to stats + chart) ── */
  buildChainFilter('chain-filter', chains, chain => {
    activeStatsChain = chain;
    applyPeriodStats(activeStatsPeriod); // UAW recalculates inside
  });

  buildChainFilter('chart-chain-filter', chains, chain => {
    activeChartChain = chain;
    renderChart(filteredTxs(activeChartChain), activeChartDays);
  });

  /* ── Chart ── */
  function applyChartPeriod(period) {
    if (period === 'all') {
      // Show every day from the earliest tx in the dataset
      const txs = filteredTxs(activeChartChain);
      if (txs.length === 0) { activeChartDays = 7; renderChart(txs, 7); return; }
      const oldestTs  = txs[txs.length - 1].timeStamp;
      activeChartDays = Math.max(1, Math.ceil((Date.now() / 1000 - oldestTs) / 86400) + 1);
    } else {
      activeChartDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 7;
    }
    renderChart(filteredTxs(activeChartChain), activeChartDays);
  }

  applyChartPeriod('7d');

  document.querySelectorAll('#chart-time-tabs .ttab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#chart-time-tabs .ttab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyChartPeriod(btn.dataset.period);
    });
  });

  /* ── About section ── */
  $('about-title').textContent = `What is ${proj.name}?`;
  $('about-text').textContent  = proj.about || proj.description || '';
  const au = $('about-url');
  if (au) { au.href = proj.url || '#'; au.textContent = proj.url || ''; }
  const tl = $('about-tags-list');
  if (tl) {
    tl.innerHTML = (proj.tags || []).map(t => `<span class="tag-pill">${t}</span>`).join('');
  }

  /* ── Share button ── */
  const shareBtn = $('share-btn');
  if (shareBtn) {
    const popup = document.createElement('div');
    popup.className = 'share-popup';
    const pageUrl = window.location.href;
    const encodedUrl = encodeURIComponent(pageUrl);
    const encodedText = encodeURIComponent(`Check out ${proj.name} on Onchain Radar`);

    popup.innerHTML = `
      <button class="share-popup-item" id="share-copy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Copy link
      </button>
      <a class="share-popup-item" href="https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        Share on X
      </a>
      <a class="share-popup-item" href="https://t.me/share/url?url=${encodedUrl}&text=${encodedText}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.912 4.23 13.01c-.65-.204-.664-.65.136-.964l11.27-4.344c.542-.197 1.016.13.258.52z"/>
        </svg>
        Share on Telegram
      </a>
      <a class="share-popup-item" href="mailto:?subject=${encodeURIComponent(`Check out ${proj.name} on Onchain Radar`)}&body=${encodeURIComponent(`Check out ${proj.name} on Onchain Radar:\n${pageUrl}`)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2 4 12 13 22 4"/>
        </svg>
        Share via Email
      </a>`;
    document.body.appendChild(popup);

    function positionPopup() {
      const r = shareBtn.getBoundingClientRect();
      popup.style.top  = `${r.bottom + 8}px`;
      popup.style.left = `${r.left + r.width / 2}px`;
      popup.style.transform = 'translateX(-50%)';
    }

    shareBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = popup.classList.contains('open');
      popup.classList.remove('open');
      if (!isOpen) { positionPopup(); popup.classList.add('open'); }
    });

    $('share-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(pageUrl).then(() => {
        const btn = $('share-copy');
        const orig = btn.innerHTML;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span class="copied-label">Copied!</span>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    });

    document.addEventListener('click', e => {
      if (!popup.contains(e.target) && e.target !== shareBtn) popup.classList.remove('open');
    });
  }

  /* ── Report button ── */
  const reportBtn = $('report-btn');
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      const subject = encodeURIComponent(`Report: ${proj.name}`);
      const body = encodeURIComponent(
        `Hi,\n\nI'd like to report an issue with the following project on Onchain Radar:\n\n` +
        `Project: ${proj.name}\nLink: ${window.location.href}\n\n` +
        `Issue description:\n[Please describe the issue here]\n\n` +
        `Thank you`
      );
      window.location.href = `mailto:alex@dexstudios.net?subject=${subject}&body=${body}`;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initLightbox();
  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = initDashboard;
    document.head.appendChild(s);
  } else {
    initDashboard();
  }
});
