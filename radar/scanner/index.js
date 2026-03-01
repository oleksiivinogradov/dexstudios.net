const axios = require('axios');
const fs = require('fs');
const path = require('path');

const NETWORK_ID = '50312';
const CONTRACT_ADDRESS = '0x6CD6978C794ee76d8440CB0a81CF3B200a39c7E3';
const OUTPUT_DIR = path.join(__dirname, '..', 'evm', NETWORK_ID, CONTRACT_ADDRESS);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'aggregation.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function scan() {
  console.log(`Starting scan for ${CONTRACT_ADDRESS}...`);
  try {
    // Fetch recent transactions (up to 10,000) to compute stats
    // Note: To get the true absolute total without a professional indexer, 
    // we paginate or rely on the max allowed per page.
    const url = `https://explorer.somnia.network/api?module=account&action=txlist&address=${CONTRACT_ADDRESS}&page=1&offset=10000&sort=desc`;
    
    const response = await axios.get(url);
    if (response.data.status !== '1' && response.data.message !== 'No transactions found') {
      console.error('Error fetching data from explorer:', response.data.result);
      // Wait, let's not fail completely if it's just 'No transactions found'
      if(response.data.status === '0' && response.data.message === 'NOTOK') {
        throw new Error(response.data.result);
      }
    }

    const transactions = response.data.result || [];
    
    if (!Array.isArray(transactions)) {
        console.log("No transactions array returned. API returned:", response.data);
    }

    const txs = Array.isArray(transactions) ? transactions : [];

    // Calculate 'total' (limited to our pagination horizon)
    const totalTransactions = txs.length;

    // Calculate transactions per hour based on the fetched batch
    let txPerHour = 0;
    if (txs.length > 0) {
      const latestTxTime = parseInt(txs[0].timeStamp);
      const oneHourAgo = latestTxTime - 3600;
      
      txPerHour = txs.filter(tx => parseInt(tx.timeStamp) >= oneHourAgo).length;
    }

    // Get strictly the last 10
    const last10 = txs.slice(0, 10).map(tx => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      timeStamp: tx.timeStamp,
      blockNumber: tx.blockNumber
    }));

    const aggregationData = {
      networkId: NETWORK_ID,
      contractAddress: CONTRACT_ADDRESS,
      lastUpdated: new Date().toISOString(),
      totalTransactionsScanned: totalTransactions,
      transactionsLastHour: txPerHour,
      recentTransactions: last10
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(aggregationData, null, 2));
    console.log(`Successfully saved aggregation data to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Scanner error:', error.message);
    process.exit(1);
  }
}

scan();
