// State Management
let trades = JSON.parse(localStorage.getItem('paperTrades')) || [];

// Save to LocalStorage
function saveTrades() {
    localStorage.setItem('paperTrades', JSON.stringify(trades));
    renderUI();
}

// Fetch Token Info from DexScreener
async function fetchTokenInfo(ca) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            return {
                name: pair.baseToken.name || "Unknown Token",
                symbol: pair.baseToken.symbol || "UNK",
                image: pair.info && pair.info.imageUrl ? pair.info.imageUrl : 'https://via.placeholder.com/32?text=?'
            };
        }
    } catch (error) {
        console.error("Failed to fetch token data", error);
    }
    return { name: "Unknown Token", symbol: "???", image: 'https://via.placeholder.com/32?text=?' };
}

// Add New Trade
document.getElementById('newTradeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('addTradeBtn');
    const caInput = document.getElementById('ca').value.trim();
    const buyPriceInput = parseFloat(document.getElementById('buyPrice').value);

    if (!caInput || isNaN(buyPriceInput)) return;

    btn.innerText = "Fetching...";
    btn.disabled = true;

    const tokenInfo = await fetchTokenInfo(caInput);

    const newTrade = {
        id: Date.now().toString(),
        ca: caInput,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        image: tokenInfo.image,
        buyPrice: buyPriceInput,
        timestamp: new Date().toISOString(),
        status: 'open',
        soldPercentage: 0,
        sells: [], // stores { sellPrice, percentage, timestamp, pnl }
        totalRevenue: 0
    };

    trades.push(newTrade);
    document.getElementById('newTradeForm').reset();
    btn.innerText = "Fetch Token & Add Trade";
    btn.disabled = false;
    
    saveTrades();
});

// Add Partial or Full Sell
function handleSell(tradeId) {
    const sellPrice = parseFloat(document.getElementById(`sellPrice-${tradeId}`).value);
    const sellPct = parseFloat(document.getElementById(`sellPct-${tradeId}`).value);

    if (isNaN(sellPrice) || isNaN(sellPct) || sellPct <= 0) return;

    const tradeIndex = trades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) return;

    let trade = trades[tradeIndex];

    // Ensure we don't sell more than 100%
    const actualSellPct = Math.min(sellPct, 100 - trade.soldPercentage);
    
    // Calculate cost basis and PnL for this specific chunk
    const costBasis = trade.buyPrice * (actualSellPct / 100);
    const pnlSol = sellPrice - costBasis;
    const pnlPct = ((sellPrice / costBasis) - 1) * 100;

    trade.sells.push({
        sellPrice: sellPrice,
        percentage: actualSellPct,
        pnlSol: pnlSol,
        pnlPct: pnlPct,
        timestamp: new Date().toISOString()
    });

    trade.soldPercentage += actualSellPct;
    trade.totalRevenue += sellPrice;

    if (trade.soldPercentage >= 100) {
        trade.status = 'closed';
    }

    trades[tradeIndex] = trade;
    saveTrades();
}

// Formatting Utilities
const formatSol = (val) => `${val > 0 ? '+' : ''}${val.toFixed(3)} SOL`;
const formatPct = (val) => `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
const getColorClass = (val) => val > 0 ? 'text-green' : val < 0 ? 'text-red' : '';

// Render UI
function renderUI() {
    renderOpenTrades();
    renderHistory();
}

function renderOpenTrades() {
    const openContainer = document.getElementById('openTradesList');
    openContainer.innerHTML = '';

    const openTrades = trades.filter(t => t.status === 'open').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (openTrades.length === 0) {
        openContainer.innerHTML = '<p style="color: var(--text-muted)">No open trades right now.</p>';
        return;
    }

    openTrades.forEach(trade => {
        const remainingPct = 100 - trade.soldPercentage;
        openContainer.innerHTML += `
            <div class="trade-item">
                <div class="trade-header">
                    <img src="${trade.image}" alt="${trade.symbol}">
                    <div class="trade-info">
                        <div class="trade-name">${trade.name} ($${trade.symbol})</div>
                        <div class="trade-date">${new Date(trade.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div><strong>Bought:</strong> ${trade.buyPrice} SOL</div>
                <div><strong>Status:</strong> ${trade.soldPercentage}% Sold (${remainingPct}% Open)</div>
                
                <div class="sell-form">
                    <div class="input-group">
                        <label>Sell Amount (SOL)</label>
                        <input type="number" id="sellPrice-${trade.id}" step="0.001" placeholder="e.g. 0.38">
                    </div>
                    <div class="input-group">
                        <label>Sell %</label>
                        <input type="number" id="sellPct-${trade.id}" max="${remainingPct}" value="${remainingPct}">
                    </div>
                    <button class="btn-sell" onclick="handleSell('${trade.id}')">Execute</button>
                </div>
            </div>
        `;
    });
}

function renderHistory() {
    const historyContainer = document.getElementById('dailyHistoryList');
    historyContainer.innerHTML = '';

    // Group closed trades by Date
    const closedTrades = trades.filter(t => t.status === 'closed');
    const grouped = {};

    closedTrades.forEach(trade => {
        // Use the timestamp of the LAST sell to determine the close date
        const closeDate = new Date(trade.sells[trade.sells.length - 1].timestamp).toLocaleDateString();
        if (!grouped[closeDate]) grouped[closeDate] = [];
        grouped[closeDate].push(trade);
    });

    const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

    if (dates.length === 0) {
        historyContainer.innerHTML = '<p style="color: var(--text-muted)">No closed trades yet.</p>';
        return;
    }

    dates.forEach(date => {
        const dayTrades = grouped[date];
        let dailyPnlSol = 0;
        let wins = 0;

        let tradesHtml = '';
        dayTrades.forEach(trade => {
            let totalTradePnlSol = trade.totalRevenue - trade.buyPrice;
            let totalTradePnlPct = ((trade.totalRevenue / trade.buyPrice) - 1) * 100;
            
            dailyPnlSol += totalTradePnlSol;
            if (totalTradePnlSol > 0) wins++;

            tradesHtml += `
                <div class="trade-item">
                    <div class="trade-header">
                        <img src="${trade.image}" alt="${trade.symbol}">
                        <div class="trade-info">
                            <div class="trade-name">${trade.name}</div>
                        </div>
                        <div class="${getColorClass(totalTradePnlSol)}">
                            ${formatPct(totalTradePnlPct)} (${formatSol(totalTradePnlSol)})
                        </div>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        Initial Buy: ${trade.buyPrice} SOL <br>
                        ${trade.sells.map(s => `Sold ${s.percentage}% for ${s.sellPrice} SOL`).join('<br>')}
                    </div>
                </div>
            `;
        });

        const winRate = ((wins / dayTrades.length) * 100).toFixed(1);

        historyContainer.innerHTML += `
            <div class="daily-log">
                <h3>${date}</h3>
                <div class="daily-stats">
                    <div><strong>Daily PnL:</strong> <span class="${getColorClass(dailyPnlSol)}">${formatSol(dailyPnlSol)}</span></div>
                    <div><strong>Win Rate:</strong> ${winRate}% (${wins}/${dayTrades.length})</div>
                </div>
                ${tradesHtml}
            </div>
        `;
    });
}

// Initial Render
renderUI();
