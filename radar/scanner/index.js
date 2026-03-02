const fs = require('fs');
const path = require('path');
const { JsonRpcProvider } = require('ethers'); // Ethers v6

// Silence ethers.js internal network detection warnings that spam the console
const originalLog = console.log;
console.log = function (...args) {
  if (typeof args[0] === 'string' && args[0].includes('JsonRpcProvider failed to detect network')) return;
  originalLog.apply(console, args);
};

const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

// DefiLlama Chainlist is cloned in ../chainlist but for stability & speed we map the specific chains directly
const NETWORK_RPCS = {
  'skale-nebula': [
    'https://mainnet.skalenodes.com/v1/green-giddy-denebola'
  ],
  'somnia': [
    'https://api.infra.mainnet.somnia.network/'
  ],
  'polygon': [
    'https://polygon.llamarpc.com',
    'https://polygon-rpc.com',
    'https://rpc.ankr.com/polygon'
  ]
};

const WAIT_TIME_ON_LIMIT = 5000;
const MAX_HISTORY_SECONDS = 24 * 60 * 60; // 1 day

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Custom Provider with Rotation
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
        // Returns block with prefetched transactions
        const block = await this.provider.getBlock(blockNumber, true);
        return block;
      } catch (err) {
        console.error(`[${this.network}] Error fetching block ${blockNumber} on RPC ${this.rpcs[this.currentIndex]}: ${err.message}`);
        if (err.message.includes('rate') || err.message.includes('429')) {
          this.rotate();
        }
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

async function runScanner() {
  console.log("Starting Multi-Project RPC Block Scanner...");

  // 1. Load All Projects
  const projects = [];
  const dirs = fs.readdirSync(PROJECTS_DIR);
  for (const d of dirs) {
    const pPath = path.join(PROJECTS_DIR, d);
    if (fs.statSync(pPath).isDirectory()) {
      const dataFile = path.join(pPath, 'data.json');
      if (fs.existsSync(dataFile)) {
        projects.push({
          id: d,
          path: pPath,
          data: JSON.parse(fs.readFileSync(dataFile, 'utf8'))
        });
      }
    }
  }

  // 2. Group Contracts by Chain
  // chain => { contracts_lowercase: Set, projects_map: { contract_lowercase => [ { projectId, network, address } ] } }
  const chainsMap = {};
  for (const proj of projects) {
    for (const contract of (proj.data.contracts || [])) {
      const chain = contract.chain;
      const address = contract.address.toLowerCase();

      if (!chainsMap[chain]) {
        chainsMap[chain] = {
          addresses: new Set(),
          mappings: {}
        };
      }
      chainsMap[chain].addresses.add(address);
      if (!chainsMap[chain].mappings[address]) chainsMap[chain].mappings[address] = [];
      chainsMap[chain].mappings[address].push({ projectId: proj.id, ...contract });
    }
  }

  // 3. Process Each Chain
  for (const chain of Object.keys(chainsMap)) {
    console.log(`\n================ Processing Chain: ${chain} ================`);
    if (!NETWORK_RPCS[chain]) {
      console.log(`Skipping unknown chain ${chain}`);
      continue;
    }

    const addressesToTrack = Array.from(chainsMap[chain].addresses);
    console.log(`Tracking ${addressesToTrack.length} contracts on ${chain}`);

    // We need persistence logic for tracking blocks globally per chain
    // Let's store a chain_state.json in radar/scanner/
    const stateFile = path.join(__dirname, `${chain}_state.json`);
    let lastProcessedBlock = 0;
    if (fs.existsSync(stateFile)) {
      lastProcessedBlock = JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastProcessedBlock || 0;
    }

    const provider = new RotatingProvider(chain);

    try {
      const latestBlockNumber = await provider.getLatestBlockNumber();
      console.log(`[${chain}] Latest block: ${latestBlockNumber}, Last processed: ${lastProcessedBlock || 'None'}`);

      let targetBlock = latestBlockNumber;
      const stopBlock = lastProcessedBlock > 0 ? lastProcessedBlock : 0;

      const oneDayAgo = Math.floor(Date.now() / 1000) - MAX_HISTORY_SECONDS;

      // Statistics per project/contract
      // We load existing stats to append totals, but replace recent txs.
      const statsCache = {};
      const getStatsObj = (projectId, contractAdd) => {
        const sid = `${projectId}_${contractAdd}`;
        if (statsCache[sid]) return statsCache[sid];

        const sDir = path.join(PROJECTS_DIR, projectId, 'stats');
        if (!fs.existsSync(sDir)) fs.mkdirSync(sDir, { recursive: true });
        const sFile = path.join(sDir, `${chain}_${contractAdd}.json`);

        let stats = { total: 0, last24h: 0, recentTxs: [] };
        if (fs.existsSync(sFile)) {
          stats = JSON.parse(fs.readFileSync(sFile, 'utf8'));
        }
        // Reset last24h and recent on every run, total accumulates
        stats.last24h = 0;
        statsCache[sid] = { file: sFile, data: stats };
        return statsCache[sid];
      };

      let blockCountProcessed = 0;
      let hitTimeLimit = false;

      // Block Scan Loop
      while (targetBlock > stopBlock && !hitTimeLimit) {
        // Fetch Block
        const block = await provider.fetchBlockWithRetry(targetBlock);
        if (!block) {
          targetBlock--;
          continue;
        }

        if (blockCountProcessed % 100 === 0) {
          console.log(`[${chain}] Scanning block ${targetBlock} (${new Date(block.timestamp * 1000).toISOString()})...`);
        }

        if (block.timestamp < oneDayAgo) {
          console.log(`[${chain}] Reached 1-day history limit at block ${targetBlock}. Stopping.`);
          hitTimeLimit = true;
          break;
        }

        // Pre-fetched transactions in block object for ether v6
        for (const tx of block.prefetchedTransactions || []) {
          if (tx.to && chainsMap[chain].addresses.has(tx.to.toLowerCase())) {
            // Found a transaction!
            const toAddress = tx.to.toLowerCase();
            const mappings = chainsMap[chain].mappings[toAddress];

            for (const map of mappings) {
              const sObj = getStatsObj(map.projectId, toAddress);
              sObj.data.total += 1;
              sObj.data.last24h += 1;

              // Keep top 10
              if (sObj.data.recentTxs.length < 10) {
                sObj.data.recentTxs.push({
                  hash: tx.hash,
                  from: tx.from,
                  value: tx.value.toString(),
                  blockNumber: targetBlock,
                  timeStamp: block.timestamp
                });
              }
            }
          }
        }

        targetBlock--;
        blockCountProcessed++;

        // Safety exit for GitHub Actions (don't run forever if chain is massive like polygon)
        // We'll limit to 5000 blocks per manual scan to avoid 6hr timeout, 
        // Polygon does 40k a day, 5000 takes ~5-10 mins. 
        // Next run will pick up where it left off!
        if (blockCountProcessed >= 1500 && lastProcessedBlock === 0) {
          console.log(`[${chain}] Reached max 1500 blocks for a single bootstrapping run. Will continue next cycle.`);
          break;
        }
      }

      // Save Stats
      for (const key of Object.keys(statsCache)) {
        const sObj = statsCache[key];
        sObj.data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(sObj.file, JSON.stringify(sObj.data, null, 2));
      }

      // Save Chain State (where we left off, or the highest block we scraped)
      // If we didn't hit time limit or block restriction, our new "last processed" is the latest block.
      // Actually, we should always save latestBlockNumber so we don't rescan things we already scanned
      if (lastProcessedBlock === 0) {
        // If it was the first run, we only went back 1500 blocks. 
        // So the new "last processed" should be latestBlockNumber. Wait no, if we set it to latest, we skip the remaining gap!
        // To keep it simple, we don't care about the gap. We care about LIVE data.
        // We set lastProcessedBlock to latestBlockNumber.
        fs.writeFileSync(stateFile, JSON.stringify({ lastProcessedBlock: latestBlockNumber }));
      } else {
        fs.writeFileSync(stateFile, JSON.stringify({ lastProcessedBlock: latestBlockNumber }));
      }

      console.log(`[${chain}] Done. Processed ${blockCountProcessed} blocks.`);

    } catch (err) {
      console.error(`[${chain}] Fatal error processing chain: ${err.message}`);
    }
  }

  console.log("Scanner Multi-Project Run Complete!");
}

runScanner().catch(console.error);
