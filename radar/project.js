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

async function initDashboard() {
    try {
        // 1. Fetch Project Data configuration
        const dataRes = await fetch('./data.json');
        if (!dataRes.ok) throw new Error('Failed to load project config');
        const projData = await dataRes.json();

        // Update UI Hero
        document.title = `${projData.name} - Web3 Radar`;

        const titleEl = document.getElementById('project-title');
        titleEl.textContent = projData.name;
        titleEl.classList.remove('placeholder-text');

        const descEl = document.getElementById('project-desc');
        descEl.textContent = projData.description;
        descEl.classList.remove('placeholder-text-p');

        const logoEl = document.getElementById('project-logo');
        if (projData.logo) {
            logoEl.src = projData.logo;
            logoEl.onerror = () => {
                logoEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="%2327272a"><rect width="120" height="120"/></svg>';
            };
        } else {
            // Default placeholder
            logoEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="%2327272a"><rect width="120" height="120"/></svg>';
        }
        logoEl.classList.remove('placeholder-pulse');

        document.getElementById('project-url').href = projData.url;

        // Render Badges
        const chainsExtracted = [...new Set((projData.contracts || []).map(c => c.chain))];
        const badgesContainer = document.getElementById('chain-badges');
        badgesContainer.innerHTML = '';
        chainsExtracted.forEach(chain => {
            const badge = document.createElement('span');
            badge.className = 'chain-badge';
            // simple formatting
            badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z"/></svg> ${chain.toUpperCase()}`;
            badgesContainer.appendChild(badge);
        });

        // 2. Fetch and Aggregate Stats
        let aggregateTotal = 0;
        let aggregate24h = 0;
        let allRecentTxs = [];
        let trackedContractsCount = 0;
        let lastUpdatedStr = null;

        for (const contract of (projData.contracts || [])) {
            trackedContractsCount++;
            try {
                // Fetch stat file matching scanner output: stats/{chain}_{address}.json
                const statRes = await fetch(`./stats/${contract.chain}_${contract.address.toLowerCase()}.json?t=${Date.now()}`);
                if (statRes.ok) {
                    const stats = await statRes.json();
                    aggregateTotal += stats.total;
                    aggregate24h += stats.last24h;

                    if (stats.lastUpdated) {
                        lastUpdatedStr = stats.lastUpdated;
                    }

                    // Annotate transactions with chain for the table
                    const annotatedTxs = (stats.recentTxs || []).map(tx => ({
                        ...tx,
                        chain: contract.chain,
                        contractAddress: contract.address
                    }));

                    allRecentTxs = allRecentTxs.concat(annotatedTxs);
                }
            } catch (err) {
                console.warn(`Could not load stats for ${contract.address} on ${contract.chain}`);
            }
        }

        // Apply Stats
        document.getElementById('stat-total').textContent = aggregateTotal.toLocaleString();
        document.getElementById('stat-24h').textContent = aggregate24h.toLocaleString();
        document.getElementById('stat-contracts').textContent = trackedContractsCount;

        if (lastUpdatedStr) {
            document.getElementById('last-updated').textContent = `Last update: ${new Date(lastUpdatedStr).toLocaleTimeString()}`;
        }

        // Render Table
        // Sort all aggregated transactions globally by most recent
        allRecentTxs.sort((a, b) => b.timeStamp - a.timeStamp);

        // Take top 15
        const top15 = allRecentTxs.slice(0, 15);
        const tbody = document.getElementById('tx-body');
        tbody.innerHTML = '';

        if (top15.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #64748b;">No recent transactions found across tracked contracts.</td></tr>`;
            return;
        }

        top15.forEach(tx => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <a href="#" class="tx-hash">${formatHash(tx.hash)}</a>
                </td>
                <td style="text-transform: capitalize; color: #94a3b8;">${tx.chain.replace('-', ' ')}</td>
                <td><span class="contract-badge">${formatHash(tx.contractAddress)}</span></td>
                <td>${tx.blockNumber.toLocaleString()}</td>
                <td class="right-align">${formatTimeAgo(tx.timeStamp)}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Dashboard init error:", e);
        document.getElementById('tx-body').innerHTML = `<tr><td colspan="5" class="loading-state" style="color:#ef4444;">Failed to load project configuration or data.</td></tr>`;
    }
}

// Initial Bootstrap
document.addEventListener('DOMContentLoaded', initDashboard);

// Auto-refresh every 60s
setInterval(initDashboard, 60000);
