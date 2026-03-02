#!/usr/bin/env node
/**
 * Historical backfill using block-explorer APIs (Blockscout / Etherscan-compatible).
 *
 * Usage:
 *   node backfill.js [--days=30] [--chain=somnia]
 *
 * Env vars (set as GitHub secrets):
 *   POLYGONSCAN_API_KEY   – Polygonscan API key
 *   SOMNIA_API_KEY        – Somnia explorer API key (if required)
 *   SKALE_API_KEY         – SKALE Nebula explorer API key (if required)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

// ── Config ────────────────────────────────────────────────────────

const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

const DAYS_ARG  = process.argv.find(a => a.startsWith('--days='));
const CHAIN_ARG = process.argv.find(a => a.startsWith('--chain='));
const DAYS  = parseInt(DAYS_ARG?.split('=')[1]  || '30', 10);
const ONLY_CHAIN = CHAIN_ARG?.split('=')[1] || null;

console.log(`Backfill: ${DAYS} days${ONLY_CHAIN ? ` / chain=${ONLY_CHAIN}` : ' / all chains'}`);

/**
 * Explorer API configs.
 * All use Etherscan-compatible module=account&action=txlist endpoints.
 * Blockscout (SKALE, Somnia) returns up to 10 000 results per page.
 * Polygonscan returns up to 10 000 results per page.
 */
const EXPLORER_APIS = {
  'somnia': {
    url:    'https://mainnet.somnia.w3us.site/api',
    apiKey: process.env.SOMNIA_API_KEY || '',
  },
  'skale-nebula': {
    url:    'https://nebula.explorer.skale.network/api',
    apiKey: process.env.SKALE_API_KEY || '',
  },
  'polygon': {
    url:    'https://api.polygonscan.com/api',
    apiKey: process.env.POLYGONSCAN_API_KEY || '',
  },
};

const PAGE_SIZE   = 10_000;
const RATE_DELAY  = 300; // ms between API requests

// ── Helpers (mirrors scanner/index.js) ───────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function isoDate(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function loadDayBucket(dir, dateStr) {
  const f = path.join(dir, `${dateStr}.json`);
  if (!fs.existsSync(f)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(f, 'utf8')));
}

function saveDayBucket(dir, dateStr, set) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${dateStr}.json`), JSON.stringify([...set].sort()));
}

function loadAlltime(dir) {
  const f = path.join(dir, 'alltime.json');
  if (!fs.existsSync(f)) return {};
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function saveAlltime(dir, obj) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'alltime.json'), JSON.stringify(obj));
}

function unionDays(dir, n) {
  const union = new Set();
  for (let i = 0; i < n; i++) {
    for (const w of loadDayBucket(dir, daysAgoStr(i))) union.add(w);
  }
  return union.size;
}

function computeAndSaveUAW(projectPath) {
  const walletsDir = path.join(projectPath, 'wallets');
  const alltime    = loadAlltime(walletsDir);
  const uaw = {
    uaw24h:     unionDays(walletsDir, 2),
    uaw7d:      unionDays(walletsDir, 7),
    uaw30d:     unionDays(walletsDir, 30),
    uawAlltime: Object.keys(alltime).length,
    byChain:    {},
    lastUpdated: new Date().toISOString(),
  };
  if (fs.existsSync(walletsDir)) {
    for (const entry of fs.readdirSync(walletsDir)) {
      const chainDir = path.join(walletsDir, entry);
      if (fs.statSync(chainDir).isDirectory()) {
        const ca = loadAlltime(chainDir);
        uaw.byChain[entry] = {
          uaw24h:     unionDays(chainDir, 2),
          uaw7d:      unionDays(chainDir, 7),
          uaw30d:     unionDays(chainDir, 30),
          uawAlltime: Object.keys(ca).length,
        };
      }
    }
  }
  fs.writeFileSync(path.join(projectPath, 'uaw.json'), JSON.stringify(uaw, null, 2));
  return uaw;
}

// ── Explorer API fetch ────────────────────────────────────────────

/**
 * Fetch ALL transactions for a contract address from a block-explorer API.
 * Handles pagination automatically.
 * Returns array of raw tx objects (Etherscan-compatible shape).
 */
async function fetchAllTxs(chain, address, fromTimestamp) {
  const cfg = EXPLORER_APIS[chain];
  if (!cfg) throw new Error(`No explorer API configured for chain: ${chain}`);

  let allTxs  = [];
  let page    = 1;
  let hasMore = true;

  while (hasMore) {
    const params = {
      module:    'account',
      action:    'txlist',
      address,
      sort:      'asc',
      page,
      offset:    PAGE_SIZE,
    };
    if (cfg.apiKey) params.apikey = cfg.apiKey;

    let result;
    try {
      const res = await axios.get(cfg.url, { params, timeout: 30_000 });
      const body = res.data;

      if (body.status === '0') {
        // "No transactions found" is a normal empty response, not an error
        if (body.message === 'No transactions found') break;
        throw new Error(`API error: ${body.message}`);
      }
      result = body.result;
    } catch (err) {
      console.error(`  [${chain}] API request failed (page ${page}): ${err.message}`);
      break;
    }

    if (!Array.isArray(result) || result.length === 0) break;

    // Filter to requested time window
    const filtered = result.filter(tx => Number(tx.timeStamp) >= fromTimestamp);
    allTxs = allTxs.concat(filtered);

    // If the earliest tx on this page is already before our window, no need for more pages
    const earliestTs = Number(result[0].timeStamp);
    if (earliestTs < fromTimestamp || result.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      page++;
      await delay(RATE_DELAY);
    }
  }

  return allTxs;
}

// ── Stats helpers ─────────────────────────────────────────────────

function loadStats(statsFile) {
  if (!fs.existsSync(statsFile)) {
    return { total: 0, last24h: 0, recentTxs: [], dailyCounts: [] };
  }
  return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
}

function mergeStatsFromTxs(stats, txs, chain, address, cutoffTs) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cutoff24 = Math.floor(Date.now() / 1000) - 86400;

  // Rebuild dailyCounts from fetched txs (keyed by date, accumulated)
  const dayMap = {};
  for (const { date, count } of (stats.dailyCounts || [])) dayMap[date] = count;

  // Existing tx hashes to avoid double-counting
  const knownHashes = new Set((stats.recentTxs || []).map(t => t.hash));

  let addedTotal = 0;
  for (const tx of txs) {
    if (knownHashes.has(tx.hash)) continue;
    knownHashes.add(tx.hash);
    addedTotal++;

    const d = isoDate(Number(tx.timeStamp));
    dayMap[d] = (dayMap[d] || 0) + 1;

    if (stats.recentTxs.length < 10 && Number(tx.timeStamp) >= cutoff24) {
      stats.recentTxs.push({
        hash:        tx.hash,
        from:        tx.from,
        value:       tx.value || '0',
        blockNumber: Number(tx.blockNumber),
        timeStamp:   Number(tx.timeStamp),
      });
    }
  }

  stats.total += addedTotal;
  stats.dailyCounts = Object.entries(dayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  // Recompute last24h from today + yesterday dailyCounts
  const yStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const t = stats.dailyCounts.find(d => d.date === todayStr)?.count  ?? 0;
  const y = stats.dailyCounts.find(d => d.date === yStr)?.count      ?? 0;
  stats.last24h    = t + y;
  stats.lastUpdated = new Date().toISOString();

  return addedTotal;
}

// ── Main ──────────────────────────────────────────────────────────

async function runBackfill() {
  const fromTimestamp = Math.floor(Date.now() / 1000) - DAYS * 86400;
  const fromDateStr   = new Date(fromTimestamp * 1000).toISOString().slice(0, 10);
  console.log(`Fetching txs from ${fromDateStr} onwards…\n`);

  // Load all projects
  const projects = [];
  for (const d of fs.readdirSync(PROJECTS_DIR)) {
    const pPath = path.join(PROJECTS_DIR, d);
    if (!fs.statSync(pPath).isDirectory()) continue;
    const dataFile = path.join(pPath, 'data.json');
    if (fs.existsSync(dataFile)) {
      projects.push({ id: d, path: pPath, data: JSON.parse(fs.readFileSync(dataFile, 'utf8')) });
    }
  }

  // Group contracts per chain
  const chainsMap = {};
  for (const proj of projects) {
    for (const contract of (proj.data.contracts || [])) {
      const chain = contract.chain;
      if (ONLY_CHAIN && chain !== ONLY_CHAIN) continue;
      if (!EXPLORER_APIS[chain]) continue; // skip chains without API config

      if (!chainsMap[chain]) chainsMap[chain] = [];
      chainsMap[chain].push({ proj, contract });
    }
  }

  if (Object.keys(chainsMap).length === 0) {
    console.log('No chains to process (check --chain filter and EXPLORER_APIS config).');
    return;
  }

  // Process each chain
  for (const [chain, entries] of Object.entries(chainsMap)) {
    console.log(`\n════ Chain: ${chain} ════`);

    // Per-project wallet accumulators for this chain: { projId: { dateStr: Set<addr> } }
    const projWallets = {};

    for (const { proj, contract } of entries) {
      const address    = contract.address.toLowerCase();
      const statsDir   = path.join(proj.path, 'stats');
      const statsFile  = path.join(statsDir, `${chain}_${address}.json`);
      fs.mkdirSync(statsDir, { recursive: true });

      console.log(`  [${proj.id}] ${address} — fetching…`);
      const txs = await fetchAllTxs(chain, address, fromTimestamp);
      console.log(`  [${proj.id}] ${address} — ${txs.length} txs in range`);

      if (txs.length === 0) continue;

      // ── Stats file ──
      const stats  = loadStats(statsFile);
      const added  = mergeStatsFromTxs(stats, txs, chain, address, fromTimestamp);
      fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
      console.log(`  [${proj.id}] stats updated: +${added} new txs, total=${stats.total}`);

      // ── Wallet accumulator ──
      if (!projWallets[proj.id]) projWallets[proj.id] = {};
      for (const tx of txs) {
        if (!tx.from) continue;
        const from    = tx.from.toLowerCase();
        const dateStr = isoDate(Number(tx.timeStamp));
        if (!projWallets[proj.id][dateStr]) projWallets[proj.id][dateStr] = new Set();
        projWallets[proj.id][dateStr].add(from);
      }

      await delay(RATE_DELAY);
    }

    // ── Write wallet bucket files per project ──
    for (const proj of projects) {
      if (!projWallets[proj.id]) continue;
      const walletsDir      = path.join(proj.path, 'wallets');
      const chainWalletsDir = path.join(walletsDir, chain);

      // Cross-chain alltime
      const alltime = loadAlltime(walletsDir);
      // Per-chain alltime
      const chainAlltime = loadAlltime(chainWalletsDir);

      for (const [dateStr, newSet] of Object.entries(projWallets[proj.id])) {
        // Per-chain bucket
        const existing = loadDayBucket(chainWalletsDir, dateStr);
        for (const w of newSet) existing.add(w);
        saveDayBucket(chainWalletsDir, dateStr, existing);

        // Cross-chain bucket
        const existingAll = loadDayBucket(walletsDir, dateStr);
        for (const w of newSet) existingAll.add(w);
        saveDayBucket(walletsDir, dateStr, existingAll);
      }

      for (const walletSet of Object.values(projWallets[proj.id])) {
        for (const w of walletSet) {
          if (!(w in chainAlltime)) chainAlltime[w] = 1;
          if (!(w in alltime))      alltime[w]      = 1;
        }
      }
      saveAlltime(chainWalletsDir, chainAlltime);
      saveAlltime(walletsDir,      alltime);
    }
  }

  // ── Recompute UAW for all projects ──
  console.log('\n════ Recomputing UAW ════');
  for (const proj of projects) {
    const uaw = computeAndSaveUAW(proj.path);
    const byChainStr = Object.entries(uaw.byChain)
      .map(([c, v]) => `${c}:${v.uaw24h}`).join(' ');
    console.log(`  [${proj.id}] UAW 24h=${uaw.uaw24h} 7d=${uaw.uaw7d} 30d=${uaw.uaw30d} alltime=${uaw.uawAlltime}  byChain(24h): ${byChainStr || 'none'}`);
  }

  // ── Rebuild ranking.json ──
  const rankingPath = path.join(PROJECTS_DIR, 'ranking.json');
  const ranking = projects.map(proj => {
    const statsDir = path.join(proj.path, 'stats');
    let totalTxs = 0;
    if (fs.existsSync(statsDir)) {
      for (const file of fs.readdirSync(statsDir).filter(f => f.endsWith('.json'))) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(statsDir, file), 'utf8'));
          totalTxs += s.total || 0;
        } catch { /* skip corrupted file */ }
      }
    }
    return { name: proj.data.name, category: proj.data.category || 'Games', totalTxs };
  });
  ranking.sort((a, b) => b.totalTxs - a.totalTxs);
  fs.writeFileSync(rankingPath, JSON.stringify(ranking, null, 2));

  console.log('\nBackfill complete.');
}

runBackfill().catch(err => { console.error(err); process.exit(1); });
