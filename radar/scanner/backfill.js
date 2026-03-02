#!/usr/bin/env node
/**
 * RPC-based Historical Backfill
 *
 * Usage:
 *   node backfill.js [--days=30] [--chain=somnia]
 *   node backfill.js --from=YYYY-MM-DD [--to=YYYY-MM-DD] [--chain=somnia]
 *
 * Scans a historical block range via RPC (same approach as scanner/index.js).
 * Progress is saved to disk on every checkpoint — safe to cancel and re-run.
 * Completed block ranges are remembered in backfill_{chain}.json so re-running
 * the same date range skips already-scanned blocks automatically.
 *
 * Multiple runs of the same date range are idempotent:
 *   - Wallet day-buckets: set-union (adding same address twice = no-op)
 *   - Stats (total / dailyCounts): only updated for blocks NOT in done ranges
 *   - uaw.json / ranking.json: always recomputed from wallet files at end
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { JsonRpcProvider } = require('ethers');

// Silence ethers network-detection noise (same as scanner)
const _origLog = console.log;
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('JsonRpcProvider failed to detect network')) return;
  _origLog(...args);
};

// ── Paths ──────────────────────────────────────────────────────────────────

const SCANNER_DIR  = __dirname;
const PROJECTS_DIR = path.join(SCANNER_DIR, '..', 'projects');

// ── Args ───────────────────────────────────────────────────────────────────

function getArg(name) {
  const a = process.argv.find(a => a.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

const ONLY_CHAIN = getArg('chain') || null;
const FROM_ARG   = getArg('from');   // YYYY-MM-DD  (start of range, inclusive)
const TO_ARG     = getArg('to');     // YYYY-MM-DD  (end of range,   inclusive)
const DAYS_ARG   = getArg('days');   // alternative: N days back from now

// Resolve target Unix timestamp range
let reqToTs, reqFromTs;
if (FROM_ARG) {
  reqFromTs = Math.floor(new Date(FROM_ARG + 'T00:00:00Z').getTime() / 1000);
  reqToTs   = TO_ARG
    ? Math.floor(new Date(TO_ARG + 'T23:59:59Z').getTime() / 1000)
    : Math.floor(Date.now() / 1000);
} else {
  const days = parseInt(DAYS_ARG || '30', 10);
  reqToTs   = Math.floor(Date.now() / 1000);
  reqFromTs = reqToTs - days * 86400;
}

const fromDateStr = new Date(reqFromTs * 1000).toISOString().slice(0, 10);
const toDateStr   = new Date(reqToTs   * 1000).toISOString().slice(0, 10);
console.log(`Backfill: ${fromDateStr} → ${toDateStr}${ONLY_CHAIN ? ` / chain=${ONLY_CHAIN}` : ' / all chains'}`);

// ── Chain config ───────────────────────────────────────────────────────────

const NETWORK_RPCS = {
  'skale-nebula': ['https://mainnet.skalenodes.com/v1/green-giddy-denebola'],
  'somnia':       ['https://api.infra.mainnet.somnia.network/'],
};

// Average block time in seconds (used for initial block-range estimation)
const CHAIN_AVG_BLOCK_TIME = {
  'skale-nebula': 3,
  'somnia':       0.1,
};

// Blocks fetched concurrently per batch (tune vs RPC rate limits)
const BLOCK_FETCH_CONCURRENCY = {
  'skale-nebula': 10,
  'somnia':       80,
};

// Save checkpoint (state + wallets + stats) every N processed blocks
const CHECKPOINT_EVERY = {
  'skale-nebula': 200,
  'somnia':       5000,
};

const MAX_WALLET_DAYS = 30;

// ── Graceful shutdown ──────────────────────────────────────────────────────

let shutdownRequested = false;
process.on('SIGTERM', () => {
  console.log('\n[backfill] SIGTERM received — will save checkpoint and exit cleanly after current batch.');
  shutdownRequested = true;
});
process.on('SIGINT', () => {
  console.log('\n[backfill] SIGINT received — saving and exiting...');
  shutdownRequested = true;
});

// ── Utilities ──────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function isoDate(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Block-range helpers ────────────────────────────────────────────────────

/**
 * Merge a list of [fromBlock, toBlock] pairs into the minimal sorted,
 * non-overlapping representation. Adjacent ranges (gap of 1) are merged.
 */
function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out = [[...sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1] + 1) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      out.push([...sorted[i]]);
    }
  }
  return out;
}

/**
 * Subtract already-done ranges from [reqFrom, reqTo].
 * Returns a list of [from, to] sub-ranges still needing scanning,
 * sorted highest-first so we scan the most recent blocks first.
 */
function pendingRanges(reqFrom, reqTo, done) {
  let gaps = [[reqFrom, reqTo]];
  for (const [dF, dT] of done) {
    const next = [];
    for (const [gF, gT] of gaps) {
      if (dT < gF || dF > gT) { next.push([gF, gT]); continue; }
      if (gF < dF) next.push([gF, dF - 1]);
      if (gT > dT) next.push([dT + 1, gT]);
    }
    gaps = next;
  }
  return gaps.sort((a, b) => b[0] - a[0]); // highest block first
}

// ── Backfill state file (per chain) ───────────────────────────────────────

function stateFile(chain) {
  return path.join(SCANNER_DIR, `backfill_${chain}.json`);
}

function loadState(chain) {
  const f = stateFile(chain);
  if (!fs.existsSync(f)) return { done: [], inProgress: null };
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch { return { done: [], inProgress: null }; }
}

function saveState(chain, state) {
  fs.writeFileSync(stateFile(chain), JSON.stringify(state, null, 2));
}

// ── Wallet helpers (mirrors scanner/index.js exactly) ─────────────────────

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

function pruneOldBuckets(dir) {
  if (!fs.existsSync(dir)) return;
  const cutoff = daysAgoStr(MAX_WALLET_DAYS);
  for (const f of fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
    if (f.slice(0, 10) < cutoff) fs.unlinkSync(path.join(dir, f));
  }
}

function unionDays(dir, n) {
  const u = new Set();
  for (let i = 0; i < n; i++) {
    for (const w of loadDayBucket(dir, daysAgoStr(i))) u.add(w);
  }
  return u.size;
}

/**
 * Flush in-memory wallet accumulator for one chain to disk.
 * Identical logic to saveChainWallets() in scanner/index.js.
 * chainWallets: { projId: { 'YYYY-MM-DD': Set<addr> } }
 */
function flushWallets(chain, chainWallets, projects) {
  for (const proj of projects) {
    const buckets = chainWallets[proj.id];
    if (!buckets || !Object.keys(buckets).length) continue;

    const walletsDir      = path.join(proj.path, 'wallets');
    const chainWalletsDir = path.join(walletsDir, chain);

    const chainAlltime = loadAlltime(chainWalletsDir);
    const alltime      = loadAlltime(walletsDir);
    let chainNew = 0, crossNew = 0;

    for (const [dateStr, newSet] of Object.entries(buckets)) {
      // Per-chain day bucket
      const existing = loadDayBucket(chainWalletsDir, dateStr);
      for (const w of newSet) existing.add(w);
      saveDayBucket(chainWalletsDir, dateStr, existing);

      // Cross-chain day bucket
      const existingAll = loadDayBucket(walletsDir, dateStr);
      for (const w of newSet) existingAll.add(w);
      saveDayBucket(walletsDir, dateStr, existingAll);
    }

    for (const ws of Object.values(buckets)) {
      for (const w of ws) {
        if (!(w in chainAlltime)) { chainAlltime[w] = 1; chainNew++; }
        if (!(w in alltime))      { alltime[w]      = 1; crossNew++; }
      }
    }

    if (chainNew > 0) saveAlltime(chainWalletsDir, chainAlltime);
    if (crossNew > 0) saveAlltime(walletsDir,      alltime);
    pruneOldBuckets(chainWalletsDir);
    pruneOldBuckets(walletsDir);

    // Clear flushed buckets so next checkpoint only writes new data
    for (const k of Object.keys(buckets)) delete buckets[k];
  }
}

/**
 * Recompute uaw.json from wallet day-bucket files.
 * Identical to computeAndSaveUAW() in scanner/index.js.
 */
function computeAndSaveUAW(projectPath) {
  const walletsDir = path.join(projectPath, 'wallets');
  const alltime    = loadAlltime(walletsDir);
  const uaw = {
    uaw24h:      unionDays(walletsDir, 2),
    uaw7d:       unionDays(walletsDir, 7),
    uaw30d:      unionDays(walletsDir, 30),
    uawAlltime:  Object.keys(alltime).length,
    byChain:     {},
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

// ── Stats helpers ──────────────────────────────────────────────────────────

function loadStats(statsFile) {
  if (!fs.existsSync(statsFile)) {
    return { total: 0, last24h: 0, recentTxs: [], dailyCounts: [] };
  }
  return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
}

/**
 * Record one tx for a given date into the in-memory stats object.
 * Does NOT touch last24h or recentTxs — those fields belong to the
 * periodic scanner and will be rebuilt on the next scanner run.
 */
function recordTx(stats, dateStr) {
  stats.total += 1;
  if (!stats.dailyCounts) stats.dailyCounts = [];
  const entry = stats.dailyCounts.find(d => d.date === dateStr);
  if (entry) entry.count += 1;
  else stats.dailyCounts.push({ date: dateStr, count: 1 });
}

function flushStats(statsCache) {
  for (const sObj of Object.values(statsCache)) {
    sObj.data.dailyCounts = (sObj.data.dailyCounts || [])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 90); // keep more history than scanner (90 days)
    sObj.data.lastUpdated = new Date().toISOString();
    fs.mkdirSync(path.dirname(sObj.file), { recursive: true });
    fs.writeFileSync(sObj.file, JSON.stringify(sObj.data, null, 2));
  }
}

// ── RPC provider with rotation ─────────────────────────────────────────────

class RotatingProvider {
  constructor(chain) {
    this.chain = chain;
    this.rpcs  = NETWORK_RPCS[chain] || [];
    if (!this.rpcs.length) throw new Error(`No RPCs configured for chain: ${chain}`);
    this.idx  = 0;
    this.prov = new JsonRpcProvider(this.rpcs[0], undefined, { staticNetwork: true });
  }

  rotate() {
    this.idx  = (this.idx + 1) % this.rpcs.length;
    this.prov = new JsonRpcProvider(this.rpcs[this.idx], undefined, { staticNetwork: true });
    console.log(`[${this.chain}] Rotated to RPC: ${this.rpcs[this.idx]}`);
  }

  async getBlockNumber() {
    for (let i = 0; i < 4; i++) {
      try { return await this.prov.getBlockNumber(); }
      catch { this.rotate(); await delay(2000); }
    }
    throw new Error(`[${this.chain}] Cannot get latest block number`);
  }

  async getBlock(num, withTxs = false) {
    for (let i = 0; i < 4; i++) {
      try { return await this.prov.getBlock(num, withTxs); }
      catch (err) {
        if (err.message?.includes('429') || err.message?.includes('rate')) {
          this.rotate();
          await delay(3000);
        } else {
          await delay(1000);
        }
      }
    }
    return null; // skip this block rather than crashing
  }
}

// ── Binary-search: block number at a given unix timestamp ──────────────────

/**
 * Returns the lowest block number whose timestamp >= targetTs.
 * Uses a coarse estimate + bounded binary search (≤30 iterations).
 */
async function findBlockAtTs(provider, targetTs, latestBlock, latestTs, avgBlockTime) {
  if (targetTs <= 0)          return 0;
  if (targetTs >= latestTs)   return latestBlock;

  const blocksBack = Math.ceil((latestTs - targetTs) / avgBlockTime);

  // Wide initial window (±200% of estimate) so we definitely bracket the target
  let lo = Math.max(0,          latestBlock - Math.ceil(blocksBack * 3));
  let hi = Math.min(latestBlock, latestBlock - Math.floor(blocksBack / 3) + 1);

  // Ensure lo.timestamp ≤ targetTs (walk back if needed)
  for (let attempts = 0; attempts < 5; attempts++) {
    const b = await provider.getBlock(lo);
    if (!b || b.timestamp <= targetTs) break;
    lo = Math.max(0, lo - Math.ceil(blocksBack));
  }

  // Ensure hi.timestamp ≥ targetTs (walk forward if needed)
  for (let attempts = 0; attempts < 5; attempts++) {
    const b = await provider.getBlock(hi);
    if (!b || b.timestamp >= targetTs) break;
    hi = Math.min(latestBlock, hi + Math.ceil(blocksBack * 0.5));
  }

  // Binary search
  for (let i = 0; i < 30 && lo < hi; i++) {
    const mid   = Math.floor((lo + hi) / 2);
    const block = await provider.getBlock(mid);
    if (!block || block.timestamp < targetTs) lo = mid + 1;
    else                                      hi = mid;
  }

  return lo;
}

// ── Per-chain backfill ─────────────────────────────────────────────────────

async function backfillChain(chain, chainsMap, projects) {
  console.log(`\n════ Chain: ${chain} ════`);

  const provider        = new RotatingProvider(chain);
  const avgBlockTime    = CHAIN_AVG_BLOCK_TIME[chain]    || 3;
  const concurrency     = BLOCK_FETCH_CONCURRENCY[chain] || 5;
  const checkpointEvery = CHECKPOINT_EVERY[chain]        || 100;

  // ── 1. Get chain head ──────────────────────────────────────────────────
  const latestBlock = await provider.getBlockNumber();
  const latestBlockData = await provider.getBlock(latestBlock);
  const latestTs = latestBlockData?.timestamp ?? Math.floor(Date.now() / 1000);
  console.log(`[${chain}] Head block: ${latestBlock} @ ${new Date(latestTs * 1000).toISOString()}`);

  // ── 2. Find target block range ─────────────────────────────────────────
  console.log(`[${chain}] Locating block range (binary search)...`);
  const toBlock   = reqToTs >= latestTs
    ? latestBlock
    : await findBlockAtTs(provider, reqToTs,   latestBlock, latestTs, avgBlockTime);
  const fromBlock = await findBlockAtTs(provider, reqFromTs, latestBlock, latestTs, avgBlockTime);

  if (fromBlock >= toBlock) {
    console.log(`[${chain}] Resolved block range is empty (from=${fromBlock} to=${toBlock}). Skipping.`);
    return;
  }
  console.log(`[${chain}] Block range: ${fromBlock} → ${toBlock} (${toBlock - fromBlock + 1} blocks)`);

  // ── 3. Determine what still needs scanning ─────────────────────────────
  const state   = loadState(chain);
  const pending = pendingRanges(fromBlock, toBlock, state.done);

  if (!pending.length) {
    console.log(`[${chain}] Entire range already backfilled. Nothing to do.`);
    return;
  }
  const totalPending = pending.reduce((s, [f, t]) => s + t - f + 1, 0);
  console.log(`[${chain}] Pending: ${totalPending} blocks in ${pending.length} range(s). Already done: ${state.done.length} range(s).`);

  // Resume support: if inProgress points into our pending ranges, start there
  if (state.inProgress) {
    const ip = state.inProgress;
    console.log(`[${chain}] Resuming from previous checkpoint: block ${ip.nextBlock} (range ${ip.fromBlock}→${ip.toBlock})`);
  }

  // ── 4. Build stats cache (one slot per contract) ───────────────────────
  const statsCache = {};
  const getStats = (projId, addr) => {
    const key   = `${projId}_${addr}`;
    if (statsCache[key]) return statsCache[key];
    const sDir  = path.join(PROJECTS_DIR, projId, 'stats');
    const sFile = path.join(sDir, `${chain}_${addr}.json`);
    fs.mkdirSync(sDir, { recursive: true });
    statsCache[key] = { file: sFile, data: loadStats(sFile) };
    return statsCache[key];
  };
  for (const addr of chainsMap[chain].addresses) {
    for (const map of chainsMap[chain].mappings[addr]) getStats(map.projectId, addr);
  }

  // ── 5. In-memory wallet accumulator ───────────────────────────────────
  // { projId: { 'YYYY-MM-DD': Set<addr> } }
  // flushed to disk on every checkpoint, then cleared to save memory
  const chainWallets = {};

  // ── 6. Scan each pending range top-down ───────────────────────────────
  for (const [rangeFrom, rangeTo] of pending) {
    // Resume from inProgress checkpoint if it falls inside this pending range.
    // Do NOT require exact fromBlock/toBlock match — the latest block advances
    // between runs, slightly shifting the computed range boundaries.
    let startFrom = rangeTo;
    const ip = state.inProgress;
    if (ip && ip.nextBlock >= rangeFrom && ip.nextBlock < rangeTo) {
      startFrom = ip.nextBlock;
      console.log(`[${chain}] Resuming range ${rangeFrom}→${rangeTo} from checkpoint block ${startFrom}`);
    } else {
      console.log(`[${chain}] Scanning range ${rangeFrom}→${rangeTo} (${rangeTo - rangeFrom + 1} blocks)`);
    }

    // Mark range as in-progress before touching any blocks
    state.inProgress = { fromBlock: rangeFrom, toBlock: rangeTo, nextBlock: startFrom };
    saveState(chain, state);

    let current   = startFrom;
    let processed = 0;
    const totalInRange = startFrom - rangeFrom + 1;
    const scanStart    = Date.now();

    while (current >= rangeFrom) {
      if (shutdownRequested) break;

      // Build a batch scanning downward
      const batchNums = [];
      for (let i = 0; i < concurrency && (current - i) >= rangeFrom; i++) {
        batchNums.push(current - i);
      }

      // Fetch all blocks in this batch concurrently (full txs included)
      const blocks = await Promise.all(batchNums.map(n => provider.getBlock(n, true)));

      for (let bi = 0; bi < blocks.length; bi++) {
        const block    = blocks[bi];
        const blockNum = batchNums[bi];

        if (block) {
          const dateStr = isoDate(block.timestamp);
          for (const tx of (block.prefetchedTransactions || [])) {
            if (!tx.to) continue;
            const to = tx.to.toLowerCase();
            if (!chainsMap[chain].addresses.has(to)) continue;

            for (const map of chainsMap[chain].mappings[to]) {
              // Stats: additive, never resets last24h/recentTxs
              recordTx(getStats(map.projectId, to).data, dateStr);

              // Wallets: set-union (idempotent)
              const from = tx.from?.toLowerCase();
              if (from) {
                if (!chainWallets[map.projectId])          chainWallets[map.projectId] = {};
                if (!chainWallets[map.projectId][dateStr]) chainWallets[map.projectId][dateStr] = new Set();
                chainWallets[map.projectId][dateStr].add(from);
              }
            }
          }
        }
        processed++;
      }

      current -= batchNums.length;

      // Checkpoint every N blocks (or at range end, or on shutdown signal)
      const isRangeEnd  = current < rangeFrom;
      const isCheckpoint = processed % checkpointEvery === 0;
      if (isCheckpoint || isRangeEnd || shutdownRequested) {
        // Progress info
        const elapsed = (Date.now() - scanStart) / 1000 || 0.001;
        const bps     = processed / elapsed;
        const remain  = totalInRange - processed;
        const etaSec  = bps > 0 ? Math.round(remain / bps) : 0;
        const etaStr  = etaSec > 60
          ? `ETA ~${Math.floor(etaSec / 60)}m ${etaSec % 60}s`
          : `ETA ~${etaSec}s`;
        console.log(
          `[${chain}] block ${current + batchNums.length}` +
          ` | ${processed}/${totalInRange} (${Math.round(bps)}/s)` +
          ` | ${etaStr}`
        );

        // Flush wallets and stats incrementally so partial work is visible
        flushWallets(chain, chainWallets, projects);
        flushStats(statsCache);

        // Recompute UAW so UI shows updated numbers even if we're canceled
        for (const proj of projects) computeAndSaveUAW(proj.path);

        // Save scan position so next run can resume exactly here
        state.inProgress.nextBlock = current;
        saveState(chain, state);

        if (shutdownRequested) {
          console.log(`[${chain}] Checkpoint saved at block ${current}. Safe to stop.`);
          return;
        }
      }
    }

    // Range fully scanned — promote to done
    state.done = mergeRanges([...state.done, [rangeFrom, rangeTo]]);
    state.inProgress = null;
    saveState(chain, state);
    console.log(`[${chain}] Range ${rangeFrom}→${rangeTo} complete. Total done ranges: ${state.done.length}`);
  }

  // Final flush for anything remaining in the accumulator
  flushWallets(chain, chainWallets, projects);
  flushStats(statsCache);
  console.log(`[${chain}] Backfill done.`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load all projects
  const projects = [];
  for (const d of fs.readdirSync(PROJECTS_DIR)) {
    const pPath    = path.join(PROJECTS_DIR, d);
    if (!fs.statSync(pPath).isDirectory()) continue;
    const dataFile = path.join(pPath, 'data.json');
    if (fs.existsSync(dataFile)) {
      projects.push({ id: d, path: pPath, data: JSON.parse(fs.readFileSync(dataFile, 'utf8')) });
    }
  }

  // 2. Build chain → addresses map
  const chainsMap = {};
  for (const proj of projects) {
    for (const contract of (proj.data.contracts || [])) {
      const chain   = contract.chain;
      const address = contract.address.toLowerCase();
      if (ONLY_CHAIN && chain !== ONLY_CHAIN) continue;
      if (!NETWORK_RPCS[chain]) continue; // no RPC configured for this chain

      if (!chainsMap[chain]) chainsMap[chain] = { addresses: new Set(), mappings: {} };
      chainsMap[chain].addresses.add(address);
      if (!chainsMap[chain].mappings[address]) chainsMap[chain].mappings[address] = [];
      chainsMap[chain].mappings[address].push({ projectId: proj.id, ...contract });
    }
  }

  const chains = Object.keys(chainsMap);
  if (!chains.length) {
    console.log('No chains to process (check --chain filter and NETWORK_RPCS config).');
    return;
  }
  console.log(`Chains to process: ${chains.join(', ')}\n`);

  // 3. Backfill all chains in parallel (each chain is independent)
  await Promise.all(
    chains.map(chain =>
      backfillChain(chain, chainsMap, projects)
        .catch(err => console.error(`[${chain}] Fatal error: ${err.message}`))
    )
  );

  // 4. Final UAW recompute (wallet files may have been updated by multiple chains)
  console.log('\n════ Final UAW recompute ════');
  for (const proj of projects) {
    const uaw = computeAndSaveUAW(proj.path);
    const byChainStr = Object.entries(uaw.byChain)
      .map(([c, v]) => `${c}:${v.uaw24h}`).join(' ');
    console.log(
      `[${proj.id}] UAW 24h=${uaw.uaw24h} 7d=${uaw.uaw7d} 30d=${uaw.uaw30d}` +
      ` alltime=${uaw.uawAlltime}  byChain(24h): ${byChainStr || 'none'}`
    );
  }

  // 5. Rebuild ranking.json
  const rankingPath = path.join(PROJECTS_DIR, 'ranking.json');
  const ranking = projects.map(proj => {
    const statsDir = path.join(proj.path, 'stats');
    let totalTxs = 0;
    if (fs.existsSync(statsDir)) {
      for (const f of fs.readdirSync(statsDir).filter(f => f.endsWith('.json'))) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(statsDir, f), 'utf8'));
          totalTxs += s.total || 0;
        } catch { /* skip corrupted */ }
      }
    }
    return { name: proj.data.name, category: proj.data.category || 'Games', totalTxs };
  });
  ranking.sort((a, b) => b.totalTxs - a.totalTxs);
  fs.writeFileSync(rankingPath, JSON.stringify(ranking, null, 2));
  console.log('ranking.json:', ranking.map(r => `${r.name}=${r.totalTxs}`).join(', '));

  console.log('\nBackfill complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
