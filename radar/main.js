// Fetch data from GitHub hosted aggregation.json
// Note: In development with Vite, we will fetch directly from local directory
// Based on architecture, the scanner saves to `radar/evm/50312/0x6CD6978C794ee76d8440CB0a81CF3B200a39c7E3/aggregation.json`
const dataPath = './evm/50312/0x6CD6978C794ee76d8440CB0a81CF3B200a39c7E3/aggregation.json';

const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp * 1000)) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const formatHash = (hash) => {
    return `${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`;
};

async function fetchAndRenderData() {
    try {
        // Add cache buster to ensure we always get latest stats from gh-pages
        const response = await fetch(`${dataPath}?t=${new Date().getTime()}`);

        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status}`);
        }

        const data = await response.json();
        renderDashboard(data);
    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        document.getElementById('tx-list').innerHTML = `
      <div class="loading-state" style="color: #ef4444;">
        <svg xmlns="http://www.w3.org/2000/svg" style="width:40px;height:40px;margin:0 auto 1rem auto;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>Awaiting first scanner iteration or data missing.</p>
        <p style="font-size: 0.8rem; margin-top: 8px;">Run the scanner.js script to generate data.</p>
      </div>
    `;
    }
}

function renderDashboard(data) {
    // Update Metrics
    document.getElementById('total-tx').textContent = data.totalTransactionsScanned.toLocaleString();
    document.getElementById('tx-hour').textContent = data.transactionsLastHour.toLocaleString();

    // Update date
    const date = new Date(data.lastUpdated);
    document.getElementById('last-updated').textContent = `Last update: ${date.toLocaleTimeString()}`;

    // Render transactions
    const listEl = document.getElementById('tx-list');
    listEl.innerHTML = '';

    if (data.recentTransactions.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:#94a3b8;padding: 1rem;">No recent transactions found</p>';
        return;
    }

    data.recentTransactions.forEach((tx, index) => {
        // stagger animation delay
        const animationDelay = index * 0.05;

        const row = document.createElement('div');
        row.className = 'tx-row fade-in';
        row.style.animationDelay = `${animationDelay}s`;

        row.innerHTML = `
      <a href="https://explorer.somnia.network/tx/${tx.hash}" target="_blank" class="tx-hash">
        ${formatHash(tx.hash)}
      </a>
      <div class="tx-block">
        Block ${tx.blockNumber}
      </div>
      <div class="tx-time">
        ${formatTimeAgo(tx.timeStamp)}
      </div>
    `;

        listEl.appendChild(row);
    });
}

// Initial fetch
fetchAndRenderData();

// We can optionally setup a local interval if left unattended, 
// though GitHub Pages normally requires a page refresh to see new artifacts reliably unless cache beaten.
// Let's poll every minute just in case.
setInterval(fetchAndRenderData, 60000);
