const fs = require('fs');
const path = require('path');
const { JsonRpcProvider } = require('ethers'); // Ethers v6

// Silence ethers.js internal network detection warnings
const originalLog = console.log;
console.log = function (...args) {
  if (typeof args[0] === 'string' && args[0].includes('JsonRpcProvider failed to detect network')) return;
  originalLog.apply(console, args);
};

const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

const NETWORK_RPCS = {
  'skale-nebula': [
    'https://mainnet.skalenodes.com/v1/green-giddy-denebola'
  ],
  'somnia': [
    'https://api.infra.mainnet.somnia.network/'
  ],
};

// Average block time in seconds — used only on first run to estimate the start block
// (avoids scanning from genesis). A 20% buffer is applied so we slightly over-cover.
const CHAIN_AVG_BLOCK_TIME = {
  'skale-nebula': 3,
  'somnia':       0.1,
};

// How long (ms) to spend scanning each chain per run.
// Chains run in parallel so total wall-time ≈ max(budgets), not sum.
// Budget leaves ~60 s headroom for git commit/push after all chains finish.
const CHAIN_TIME_BUDGET_MS = {
  'skale-nebula': 3 * 60 * 1000,    // 3 min
  'somnia':       3.5 * 60 * 1000,  // 3.5 min (~52 k blocks at 250 blk/s)
};
const DEFAULT_CHAIN_TIME_BUDGET_MS = 3 * 60 * 1000;

// Hard ceiling — purely a safety circuit breaker to prevent runaway first-runs
// on chains that somehow have millions of blocks since genesis.
const MAX_SCAN_BLOCKS = {
  'skale-nebula': 500000,
  'somnia':       500000,
};
const DEFAULT_MAX_SCAN_BLOCKS = 500000;

// Number of blocks to fetch concurrently per chain.
// Parallel RPC calls dramatically speed up high-frequency chains like Somnia.
const BLOCK_FETCH_CONCURRENCY = {
  'skale-nebula': 5,
  'somnia':       20,
};

const WAIT_TIME_ON_LIMIT = 5000;
const MAX_HISTORY_SECONDS = 24 * 60 * 60; // 1 day
const MAX_WALLET_DAYS     = 30;            // keep day-bucket files this many days

// --quick flag: scan only 1 block to verify the pipeline works
const QUICK_MODE = process.argv.includes('--quick');
if (QUICK_MODE) console.log('⚡ QUICK MODE: scanning 1 block per chain only');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Wallet bucket helpers ────────────────────────────────────────

/** ISO date string (YYYY-MM-DD) from a unix timestamp (seconds) */
function isoDate(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

/** ISO date string for N days ago (from today) */
function daysAgoStr(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function loadDayBucket(walletsDir, dateStr) {
  const f = path.join(walletsDir, `${dateStr}.json`);
  if (!fs.existsSync(f)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(f, 'utf8')));
}

function saveDayBucket(walletsDir, dateStr, walletSet) {
  fs.mkdirSync(walletsDir, { recursive: true });
  fs.writeFileSync(
    path.join(walletsDir, `${dateStr}.json`),
    JSON.stringify(Array.from(walletSet).sort())
  );
}

/**
 * alltime.json is a plain object used as a hash-set: { "0xabc": 1, ... }
 * Key lookup is O(1) — no linear scan needed regardless of file size.
 */
function loadAlltime(walletsDir) {
  const f = path.join(walletsDir, 'alltime.json');
  if (!fs.existsSync(f)) return {};
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function saveAlltime(walletsDir, obj) {
  fs.mkdirSync(walletsDir, { recursive: true });
  fs.writeFileSync(path.join(walletsDir, 'alltime.json'), JSON.stringify(obj));
}

/** Delete day-bucket files older than MAX_WALLET_DAYS */
function pruneOldBuckets(walletsDir) {
  if (!fs.existsSync(walletsDir)) return;
  const cutoff = daysAgoStr(MAX_WALLET_DAYS);
  const files = fs.readdirSync(walletsDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  for (const f of files) {
    if (f.slice(0, 10) < cutoff) {  // ISO string comparison works correctly
      fs.unlinkSync(path.join(walletsDir, f));
      console.log(`  Pruned old wallet bucket: ${f}`);
    }
  }
}

/**
 * Union the last N day-buckets and return the count of unique wallets.
 * Only loads files that exist — no error if a day has no data.
 */
function unionDays(walletsDir, n) {
  const union = new Set();
  for (let i = 0; i < n; i++) {
    const bucket = loadDayBucket(walletsDir, daysAgoStr(i));
    for (const w of bucket) union.add(w);
  }
  return union.size;
}

/**
 * Flush wallet data for one chain to disk immediately after its scan loop.
 * This ensures SKALE data is persisted even if Somnia crashes later in the run.
 * chainWallets: { projectId: { dateStr: Set<addr> } }
 */
function saveChainWallets(chain, chainWallets, projectsArr) {
  for (const proj of projectsArr) {
    const dateBuckets = chainWallets[proj.id];
    if (!dateBuckets || Object.keys(dateBuckets).length === 0) continue;

    const walletsDir      = path.join(proj.path, 'wallets');
    const chainWalletsDir = path.join(walletsDir, chain);

    const chainAlltime = loadAlltime(chainWalletsDir);
    const alltime      = loadAlltime(walletsDir);
    let   chainNew = 0, crossNew = 0;

    for (const [dateStr, newSet] of Object.entries(dateBuckets)) {
      // Per-chain bucket
      const existing = loadDayBucket(chainWalletsDir, dateStr);
      for (const w of newSet) existing.add(w);
      saveDayBucket(chainWalletsDir, dateStr, existing);

      // Cross-chain bucket
      const existingAll = loadDayBucket(walletsDir, dateStr);
      for (const w of newSet) existingAll.add(w);
      saveDayBucket(walletsDir, dateStr, existingAll);
    }

    for (const walletSet of Object.values(dateBuckets)) {
      for (const w of walletSet) {
        if (!(w in chainAlltime)) { chainAlltime[w] = 1; chainNew++; }
        if (!(w in alltime))      { alltime[w]      = 1; crossNew++; }
      }
    }

    if (chainNew > 0) saveAlltime(chainWalletsDir, chainAlltime);
    if (crossNew > 0) saveAlltime(walletsDir, alltime);
    pruneOldBuckets(chainWalletsDir);
    pruneOldBuckets(walletsDir);
  }
}

/**
 * Recompute UAW for all windows and write uaw.json next to data.json.
 * Called after wallet files are updated for the project.
 */
/** Read every day-bucket file in a directory and return { 'YYYY-MM-DD': count } */
function buildDailyUAWMap(dir) {
  const map = {};
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
    const dateStr = f.slice(0, 10);
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      map[dateStr] = Array.isArray(arr) ? arr.length : 0;
    } catch { /* skip corrupted */ }
  }
  return map;
}

function computeAndSaveUAW(projectPath) {
  const walletsDir = path.join(projectPath, 'wallets');
  const alltime    = loadAlltime(walletsDir);
  const uaw = {
    // "24h" = today + yesterday to correctly cover the full rolling 24-hour window
    uaw24h:     unionDays(walletsDir, 2),
    uaw7d:      unionDays(walletsDir, 7),
    uaw30d:     unionDays(walletsDir, 30),
    uawAlltime: Object.keys(alltime).length,
    dailyUAW:   buildDailyUAWMap(walletsDir),
    byChain:    {},
    lastUpdated: new Date().toISOString(),
  };

  // Per-chain UAW from wallets/{chain}/ subdirectories
  if (fs.existsSync(walletsDir)) {
    for (const entry of fs.readdirSync(walletsDir)) {
      const chainDir = path.join(walletsDir, entry);
      if (fs.statSync(chainDir).isDirectory()) {
        const chainAlltime = loadAlltime(chainDir);
        uaw.byChain[entry] = {
          uaw24h:     unionDays(chainDir, 2),
          uaw7d:      unionDays(chainDir, 7),
          uaw30d:     unionDays(chainDir, 30),
          uawAlltime: Object.keys(chainAlltime).length,
          dailyUAW:   buildDailyUAWMap(chainDir),
        };
      }
    }
  }

  fs.writeFileSync(path.join(projectPath, 'uaw.json'), JSON.stringify(uaw, null, 2));
  return uaw;
}

// ── RotatingProvider ─────────────────────────────────────────────

class RotatingProvider {
  constructor(network) {
    this.network = network;
    this.rpcs = NETWORK_RPCS[network] || [];
    if (this.rpcs.length === 0) throw new Error(`No RPCs configured for ${network}`);
    this.currentIndex = 0;
    this.provider = new JsonRpcProvider(this.rpcs[this.currentIndex], undefined, { staticNetwork: true });
  }

  rotate() {
    this.currentIndex = (this.currentIndex + 1) % this.rpcs.length;
    console.log(`[${this.network}] Rotating RPC to ${this.rpcs[this.currentIndex]}`);
    this.provider = new JsonRpcProvider(this.rpcs[this.currentIndex], undefined, { staticNetwork: true });
  }

  async fetchBlockWithRetry(blockNumber, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.provider.getBlock(blockNumber, true);
      } catch (err) {
        console.error(`[${this.network}] Error fetching block ${blockNumber}: ${err.message}`);
        if (err.message.includes('rate') || err.message.includes('429')) this.rotate();
        await delay(WAIT_TIME_ON_LIMIT);
      }
    }
    throw new Error(`[${this.network}] Failed to fetch block ${blockNumber} after retries`);
  }

  async getLatestBlockNumber() {
    for (let i = 0; i < 3; i++) {
      try { return await this.provider.getBlockNumber(); }
      catch (err) { this.rotate(); await delay(2000); }
    }
    throw new Error(`[${this.network}] Failed to get latest block`);
  }
}

// ── Per-chain scanner ─────────────────────────────────────────────
// Returns { chain, chainWallets } where chainWallets is
// { projectId: { 'YYYY-MM-DD': Set<addr> } } for this chain only.
// Wallet saves are intentionally deferred to the caller so cross-chain
// shared files (wallets/*.json) are written sequentially without races.

async function scanChain(chain, chainsMap, projects) {
  const chainWallets = {}; // local wallet accumulator for this chain

  console.log(`\n================ Processing Chain: ${chain} ================`);

  const addressesToTrack = Array.from(chainsMap[chain].addresses);
  console.log(`Tracking ${addressesToTrack.length} contracts on ${chain}`);

  const stateFile = path.join(__dirname, `${chain}_state.json`);
  let lastProcessedBlock = 0;
  if (fs.existsSync(stateFile)) {
    lastProcessedBlock = JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastProcessedBlock || 0;
  }

  const provider = new RotatingProvider(chain);

  try {
    const latestBlockNumber = await provider.getLatestBlockNumber();
    console.log(`[${chain}] Latest block: ${latestBlockNumber}, Last processed: ${lastProcessedBlock || 'None'}`);

    let targetBlock    = latestBlockNumber;
    const isFirstRun   = lastProcessedBlock === 0;
    const maxBlocks    = MAX_SCAN_BLOCKS[chain] || DEFAULT_MAX_SCAN_BLOCKS;
    const timeBudgetMs = CHAIN_TIME_BUDGET_MS[chain] || DEFAULT_CHAIN_TIME_BUDGET_MS;

    // Resume from last saved position — no skip-ahead, preserving full history.
    // The time budget controls how much we process per run; state is saved on
    // every checkpoint so the next run resumes exactly where this one stopped.
    let stopBlock = lastProcessedBlock > 0 ? lastProcessedBlock : 0;
    const gap = targetBlock - stopBlock;
    if (gap > 0) {
      console.log(`[${chain}] Gap of ${gap} blocks to catch up. Time budget: ${Math.round(timeBudgetMs / 1000)}s.`);
    }

    // Safety: if gap exceeds the hard ceiling (e.g. first run on a chain with
    // millions of genesis blocks), skip ahead to avoid multi-hour bootstrap.
    if (gap > maxBlocks) {
      const newStop = targetBlock - maxBlocks;
      console.log(`[${chain}] Gap exceeds safety ceiling ${maxBlocks}. Skipping ahead (${stopBlock} → ${newStop}).`);
      stopBlock = newStop;
    }

    const firstRunCutoff = isFirstRun
      ? Math.floor(Date.now() / 1000) - MAX_HISTORY_SECONDS
      : 0;

    // ── Tx stats cache (per contract) ──
    const statsCache = {};
    const getStatsObj = (projectId, contractAdd) => {
      const sid = `${projectId}_${contractAdd}`;
      if (statsCache[sid]) return statsCache[sid];
      const sDir  = path.join(PROJECTS_DIR, projectId, 'stats');
      if (!fs.existsSync(sDir)) fs.mkdirSync(sDir, { recursive: true });
      const sFile = path.join(sDir, `${chain}_${contractAdd}.json`);
      let stats   = { total: 0, last24h: 0, recentTxs: [], dailyCounts: [] };
      if (fs.existsSync(sFile)) stats = JSON.parse(fs.readFileSync(sFile, 'utf8'));
      if (!QUICK_MODE) {
        stats.last24h   = 0;   // reset rolling window on every full run
        stats.recentTxs = [];  // rebuild from scratch each full run
      }
      statsCache[sid] = { file: sFile, data: stats };
      return statsCache[sid];
    };

    // Pre-init stats for every tracked contract
    for (const addr of chainsMap[chain].addresses) {
      for (const map of chainsMap[chain].mappings[addr]) getStatsObj(map.projectId, addr);
    }

    // Save latestBlockNumber NOW before touching any blocks.
    // If the job is cancelled at any point (even block 0), the next run
    // will correctly resume from this point instead of re-scanning.
    fs.writeFileSync(stateFile, JSON.stringify({ lastProcessedBlock: latestBlockNumber }));

    let blockCountProcessed = 0;
    let hitTimeLimit        = false;
    const totalBlocks       = latestBlockNumber - stopBlock;
    const scanStartTime     = Date.now();
    const concurrency       = BLOCK_FETCH_CONCURRENCY[chain] || 1;

    // ── Block scan loop (parallel batch fetching) ──
    // Each iteration fetches `concurrency` blocks in parallel, then processes them.
    // This dramatically reduces wall-time on fast chains like Somnia (~0.1s/block).
    while (targetBlock > stopBlock && !hitTimeLimit) {
      // Build the batch of block numbers for this iteration
      const batchNums = [];
      for (let i = 0; i < concurrency && (targetBlock - i) > stopBlock; i++) {
        batchNums.push(targetBlock - i);
      }

      // Fetch all blocks in the batch concurrently
      const blocks = await Promise.all(batchNums.map(n => provider.fetchBlockWithRetry(n)));

      for (let bi = 0; bi < blocks.length && !hitTimeLimit; bi++) {
        const block       = blocks[bi];
        const curBlockNum = batchNums[bi];

        if (!block) { blockCountProcessed++; continue; }

        // ── Progress log + checkpoint every 100 blocks ──
        if (blockCountProcessed % 100 === 0) {
          let etaStr = '';
          if (blockCountProcessed > 0 && totalBlocks > 0) {
            const elapsed    = Date.now() - scanStartTime;
            const msPerBlock = elapsed / blockCountProcessed;
            const remaining  = totalBlocks - blockCountProcessed;
            const etaSec     = Math.round(msPerBlock * remaining / 1000);
            const etaMin     = Math.floor(etaSec / 60);
            etaStr = etaMin > 0
              ? `  ETA ~${etaMin}m ${etaSec % 60}s  (${blockCountProcessed}/${totalBlocks} blocks)`
              : `  ETA ~${etaSec}s  (${blockCountProcessed}/${totalBlocks} blocks)`;
          }
          console.log(`[${chain}] Scanning block ${curBlockNum} (${new Date(block.timestamp * 1000).toISOString()})...${etaStr}`);

          // Save state so next run resumes here if the process is killed mid-scan.
          // dailyCounts is NOT updated here — only at end of chain scan.
          if (blockCountProcessed > 0) {
            fs.writeFileSync(stateFile, JSON.stringify({ lastProcessedBlock: curBlockNum }));
            for (const sObj of Object.values(statsCache)) {
              sObj.data.lastUpdated = new Date().toISOString();
              fs.writeFileSync(sObj.file, JSON.stringify(sObj.data, null, 2));
            }
          }
        }

        if (isFirstRun && block.timestamp < firstRunCutoff) {
          console.log(`[${chain}] First-run: reached 1-day history limit at block ${curBlockNum}. Stopping.`);
          hitTimeLimit = true;
          break;
        }

        const blockDateStr = isoDate(block.timestamp);

        for (const tx of (block.prefetchedTransactions || [])) {
          if (!tx.to) continue;
          const toAddress = tx.to.toLowerCase();
          if (!chainsMap[chain].addresses.has(toAddress)) continue;

          const fromAddr = tx.from?.toLowerCase();

          for (const map of chainsMap[chain].mappings[toAddress]) {
            // ── Tx stats ──
            const sObj = getStatsObj(map.projectId, toAddress);
            sObj.data.total   += 1;
            sObj.data.last24h += 1;
            if (sObj.data.recentTxs.length < 10) {
              sObj.data.recentTxs.push({
                hash: tx.hash, from: tx.from,
                value: tx.value.toString(),
                blockNumber: curBlockNum, timeStamp: block.timestamp,
              });
            }

            // ── Wallet accumulator (per project, per day) ──
            if (fromAddr) {
              if (!chainWallets[map.projectId]) chainWallets[map.projectId] = {};
              if (!chainWallets[map.projectId][blockDateStr]) chainWallets[map.projectId][blockDateStr] = new Set();
              chainWallets[map.projectId][blockDateStr].add(fromAddr);
            }
          }
        }

        blockCountProcessed++;

        if (QUICK_MODE && blockCountProcessed >= 1) {
          console.log(`[${chain}] Quick mode: stopping after 1 block.`);
          hitTimeLimit = true;
          break;
        }

        // ── Time-based stop ──
        // Adapts to RPC speed and block density. State is checkpointed every
        // 100 blocks so the next run resumes here with no historical gap.
        if (Date.now() - scanStartTime >= timeBudgetMs) {
          console.log(`[${chain}] Time budget (${Math.round(timeBudgetMs / 1000)}s) reached after ${blockCountProcessed} blocks. Resuming next run from block ${curBlockNum}.`);
          hitTimeLimit = true;
          break;
        }
      }

      targetBlock -= batchNums.length;
    }

    // ── Save tx stats ──
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const sObj of Object.values(statsCache)) {
      if (!QUICK_MODE) {
        if (!sObj.data.dailyCounts) sObj.data.dailyCounts = [];
        const todayEntry = sObj.data.dailyCounts.find(d => d.date === todayStr);
        if (todayEntry) {
          todayEntry.count += sObj.data.last24h;
        } else {
          sObj.data.dailyCounts.unshift({ date: todayStr, count: sObj.data.last24h });
        }
        sObj.data.dailyCounts = sObj.data.dailyCounts.slice(0, 30);

        const yStr   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const yEntry = sObj.data.dailyCounts.find(d => d.date === yStr);
        sObj.data.last24h = (todayEntry?.count ?? sObj.data.dailyCounts.find(d => d.date === todayStr)?.count ?? 0)
                          + (yEntry?.count ?? 0);
      }

      sObj.data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(sObj.file, JSON.stringify(sObj.data, null, 2));
    }

    // ── Save chain state ──
    fs.writeFileSync(stateFile, JSON.stringify({ lastProcessedBlock: latestBlockNumber }));
    console.log(`[${chain}] Done. Processed ${blockCountProcessed} blocks.`);

  } catch (err) {
    console.error(`[${chain}] Fatal error: ${err.message}`);
  }

  return { chain, chainWallets };
}

// ── Main scanner ─────────────────────────────────────────────────

async function runScanner() {
  console.log('Starting Multi-Project RPC Block Scanner...');

  // 1. Load all projects
  const projects = [];
  for (const d of fs.readdirSync(PROJECTS_DIR)) {
    const pPath = path.join(PROJECTS_DIR, d);
    if (!fs.statSync(pPath).isDirectory()) continue;
    const dataFile = path.join(pPath, 'data.json');
    if (fs.existsSync(dataFile)) {
      projects.push({ id: d, path: pPath, data: JSON.parse(fs.readFileSync(dataFile, 'utf8')) });
    }
  }

  // 2. Group contracts by chain
  const chainsMap = {};
  for (const proj of projects) {
    for (const contract of (proj.data.contracts || [])) {
      const chain   = contract.chain;
      const address = contract.address.toLowerCase();
      if (!chainsMap[chain]) chainsMap[chain] = { addresses: new Set(), mappings: {} };
      chainsMap[chain].addresses.add(address);
      if (!chainsMap[chain].mappings[address]) chainsMap[chain].mappings[address] = [];
      chainsMap[chain].mappings[address].push({ projectId: proj.id, ...contract });
    }
  }

  // 3. Scan all chains in parallel.
  // Each chain builds its own wallet map in memory; wallet saves happen
  // sequentially afterward to avoid races on shared cross-chain files.
  const knownChains = Object.keys(chainsMap).filter(c => NETWORK_RPCS[c]);
  const scanResults = await Promise.all(knownChains.map(chain => scanChain(chain, chainsMap, projects)));

  // 4. Flush wallet data sequentially (cross-chain wallets/ files are shared).
  for (const { chain, chainWallets } of scanResults) {
    saveChainWallets(chain, chainWallets, projects);
    console.log(`[${chain}] Wallet data flushed to disk.`);
  }

  // 4. Recompute UAW per project (wallet files already flushed after each chain)
  console.log('\n================ Updating UAW data ================');
  for (const proj of projects) {
    const uaw = computeAndSaveUAW(proj.path);
    const chainSummary = Object.entries(uaw.byChain)
      .map(([c, v]) => `${c}:${v.uaw24h}`).join(' ');
    console.log(`[${proj.id}] UAW → 24h: ${uaw.uaw24h}  7d: ${uaw.uaw7d}  30d: ${uaw.uaw30d}  alltime: ${uaw.uawAlltime}  byChain(24h): ${chainSummary || 'none'}`);
  }

  // 5. Rebuild ranking.json (total txs per project, across all chains)
  console.log('\n================ Updating ranking.json ================');
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
    return {
      name:     proj.data.name,
      category: proj.data.category || 'Games',
      totalTxs,
    };
  });
  ranking.sort((a, b) => b.totalTxs - a.totalTxs);
  fs.writeFileSync(rankingPath, JSON.stringify(ranking, null, 2));
  console.log('ranking.json updated:', ranking.map(r => `${r.name}=${r.totalTxs}`).join(', '));

  console.log('\nScanner Multi-Project Run Complete!');
}

runScanner()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
