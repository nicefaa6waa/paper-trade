// Default Gas Fee in SOL
const GAS_FEE = 0.002;

// State
let trades = JSON.parse(localStorage.getItem('proPaperTrades')) || [];
let walletBalance = parseFloat(localStorage.getItem('proWalletBalance')) || 0.000;

// Init Setup - Handle Timezones gracefully
const today = new Date();
const localDateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
document.getElementById('tradeDate').value = localDateStr;

updateWalletUI();
renderUI();

// Wallet Functions
function updateWalletUI() {
    document.getElementById('walletAmount').innerText = `${walletBalance.toFixed(3)} SOL`;
    localStorage.setItem('proWalletBalance', walletBalance.toString());
}

function addFunds() {
    const amount = parseFloat(prompt("Enter amount of virtual SOL to add:", "10"));
    if (!isNaN(amount) && amount > 0) {
        walletBalance += amount;
        updateWalletUI();
    }
}

function resetWallet() {
    if (confirm("Reset your wallet to 0.000 SOL?")) {
        walletBalance = 0;
        updateWalletUI();
    }
}

// Tab Navigation for Bottom Nav
function switchTab(tabId, element) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    // Remove active state from all nav items
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabId).classList.add('active');
    
    // If clicked via nav button, set it to active. Otherwise fallback to first button (default load)
    if (element) {
        element.classList.add('active');
    } else {
        document.querySelector('.nav-item').classList.add('active');
    }
}

// Modal Functions
function openStatsModal() {
    document.getElementById('statsModal').style.display = 'block';
    renderMonthlyStats();
}
function closeStatsModal() {
    document.getElementById('statsModal').style.display = 'none';
}

// DexScreener Fetch
async function fetchTokenInfo(ca) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
            return {
                name: data.pairs[0].baseToken.name || "Unknown",
                symbol: data.pairs[0].baseToken.symbol || "UNK",
                image: data.pairs[0].info?.imageUrl || 'https://via.placeholder.com/32?text=?'
            };
        }
    } catch (e) { console.error(e); }
    return { name: "Unknown Token", symbol: "???", image: 'https://via.placeholder.com/32?text=?' };
}

// Add Trade
document.getElementById('newTradeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('addTradeBtn');
    const dateInput = document.getElementById('tradeDate').value;
    const caInput = document.getElementById('ca').value.trim();
    const buyPrice = parseFloat(document.getElementById('buyPrice').value);
    const buyMC = parseFloat(document.getElementById('buyMC').value);

    if (!caInput || isNaN(buyPrice) || isNaN(buyMC)) return;

    walletBalance -= (buyPrice + GAS_FEE);
    updateWalletUI();

    btn.innerText = "Fetching..."; btn.disabled = true;
    const tokenInfo = await fetchTokenInfo(caInput);

    const newTrade = {
        id: Date.now().toString(),
        date: dateInput,
        ca: caInput,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        image: tokenInfo.image,
        buyPrice: buyPrice,
        buyMC: buyMC,
        status: 'open',
        soldPercentage: 0,
        totalRevenue: 0,
        totalGasPaid: GAS_FEE,
        sells: []
    };

    trades.push(newTrade);
    saveData();
    
    document.getElementById('ca').value = '';
    document.getElementById('buyPrice').value = '';
    document.getElementById('buyMC').value = '';
    
    btn.innerText = "Log Trade"; btn.disabled = false;
    
    // On Android, blur the inputs to hide keyboard automatically after submitting
    document.activeElement.blur(); 
});

// Handle Sell
function handleSell(tradeId) {
    const sellMC = parseFloat(document.getElementById(`sellMC-${tradeId}`).value);
    const sellPct = parseFloat(document.getElementById(`sellPct-${tradeId}`).value);

    if (isNaN(sellMC) || isNaN(sellPct) || sellPct <= 0) return;

    const tradeIndex = trades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) return;

    let trade = trades[tradeIndex];
    const actualSellPct = Math.min(sellPct, 100 - trade.soldPercentage);
    
    const costBasis = trade.buyPrice * (actualSellPct / 100);
    const mcMultiplier = sellMC / trade.buyMC;
    const revenueBeforeGas = costBasis * mcMultiplier;
    
    const pnlSol = revenueBeforeGas - costBasis - GAS_FEE;
    const pnlPct = ((revenueBeforeGas / costBasis) - 1) * 100;

    trade.sells.push({
        sellMC: sellMC,
        percentage: actualSellPct,
        pnlSol: pnlSol,
        pnlPct: pnlPct,
        revenue: revenueBeforeGas,
        gas: GAS_FEE,
        timestamp: new Date().toISOString()
    });

    trade.soldPercentage += actualSellPct;
    trade.totalRevenue += revenueBeforeGas;
    trade.totalGasPaid += GAS_FEE;

    walletBalance += (revenueBeforeGas - GAS_FEE);
    updateWalletUI();

    if (trade.soldPercentage >= 100) trade.status = 'closed';

    trades[tradeIndex] = trade;
    saveData();
    document.activeElement.blur(); // Hide keyboard
}

// Save & Render
function saveData() {
    localStorage.setItem('proPaperTrades', JSON.stringify(trades));
    renderUI();
}

function renderUI() {
    renderOpenTrades();
    renderHistory('todayHistoryList', true);
    renderHistory('allHistoryList', false);
}

const formatSol = (val) => `${val > 0 ? '+' : ''}${val.toFixed(3)} SOL`;
const formatPct = (val) => `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
const getColor = (val) => val > 0 ? 'text-green' : val < 0 ? 'text-red' : '';

function renderOpenTrades() {
    const container = document.getElementById('openTradesList');
    container.innerHTML = '';
    const openTrades = trades.filter(t => t.status === 'open').sort((a, b) => new Date(b.date) - new Date(a.date));

    if (openTrades.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px 0;">No active positions.</p>'; return;
    }

    openTrades.forEach(trade => {
        const remainingPct = 100 - trade.soldPercentage;
        container.innerHTML += `
            <div class="trade-item">
                <div class="trade-header">
                    <img src="${trade.image}" alt="token">
                    <div class="trade-info">
                        <div class="trade-name">${trade.name} ($${trade.symbol})</div>
                        <div class="trade-date">${trade.date} | Entry MC: $${trade.buyMC.toLocaleString()}</div>
                    </div>
                </div>
                <div style="font-size: 0.9rem; margin-bottom: 5px;"><strong>Entry:</strong> ${trade.buyPrice} SOL | <strong>Sold:</strong> ${trade.soldPercentage}%</div>
                <div class="sell-form">
                    <div class="input-group" style="margin-bottom:0">
                        <label>Sell MC ($)</label>
                        <input type="number" inputmode="numeric" id="sellMC-${trade.id}" placeholder="100000">
                    </div>
                    <div class="input-group" style="margin-bottom:0; max-width: 70px;">
                        <label>Sell %</label>
                        <input type="number" inputmode="numeric" id="sellPct-${trade.id}" max="${remainingPct}" value="${remainingPct}">
                    </div>
                    <button class="btn-sell" onclick="handleSell('${trade.id}')">Sell</button>
                </div>
            </div>
        `;
    });
}

function renderHistory(containerId, onlyToday) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    const todayStr = localDateStr; // Uses the properly formatted timezone local date
    
    let closedTrades = trades.filter(t => t.status === 'closed');
    
    if (onlyToday) {
        closedTrades = closedTrades.filter(t => t.date === todayStr);
    }

    const grouped = {};
    closedTrades.forEach(trade => {
        if (!grouped[trade.date]) grouped[trade.date] = [];
        grouped[trade.date].push(trade);
    });

    const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

    if (dates.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px 0;">No closed trades ${onlyToday ? 'today' : 'yet'}.</p>`; return;
    }

    dates.forEach(date => {
        const dayTrades = grouped[date];
        let dailyPnl = 0; let wins = 0; let tradesHtml = '';

        dayTrades.forEach(trade => {
            const netPnl = trade.totalRevenue - trade.buyPrice - trade.totalGasPaid;
            const netPct = (netPnl / trade.buyPrice) * 100;
            dailyPnl += netPnl;
            if (netPnl > 0) wins++;

            tradesHtml += `
                <div class="trade-item">
                    <div class="trade-header">
                        <img src="${trade.image}">
                        <div class="trade-info"><div class="trade-name">${trade.name}</div></div>
                        <div class="${getColor(netPnl)}">${formatPct(netPct)} <br> <small>${formatSol(netPnl)}</small></div>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        Entry MC: $${trade.buyMC.toLocaleString()} | Gas: -${trade.totalGasPaid.toFixed(3)}<br>
                        ${trade.sells.map(s => `Sold ${s.percentage}% @ $${s.sellMC.toLocaleString()}`).join('<br>')}
                    </div>
                </div>
            `;
        });

        const winRate = ((wins / dayTrades.length) * 100).toFixed(0);
        container.innerHTML += `
            <div class="daily-log">
                <h3>${date}</h3>
                <div class="daily-stats">
                    <div>PnL: <span class="${getColor(dailyPnl)}">${formatSol(dailyPnl)}</span></div>
                    <div>Win Rate: ${winRate}%</div>
                </div>
                ${tradesHtml}
            </div>
        `;
    });
}

function renderMonthlyStats() {
    const container = document.getElementById('monthlyStatsContainer');
    container.innerHTML = '';

    const grouped = {};
    trades.forEach(trade => {
        if (!grouped[trade.date]) grouped[trade.date] = { pnl: 0, count: 0, wins: 0 };
        
        trade.sells.forEach(sell => {
            grouped[trade.date].pnl += sell.pnlSol;
            if (sell.pnlSol > 0) grouped[trade.date].wins++;
        });
        grouped[trade.date].count += trade.sells.length;
    });

    const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    if(dates.length === 0) {
        container.innerHTML = "<p>No data available.</p>"; return;
    }

    dates.forEach(date => {
        const stat = grouped[date];
        const winRate = stat.count > 0 ? ((stat.wins / stat.count) * 100).toFixed(0) : 0;
        container.innerHTML += `
            <div class="stat-row">
                <strong>${date}</strong>
                <span>WR: ${winRate}%</span>
                <span class="${getColor(stat.pnl)}">${formatSol(stat.pnl)}</span>
            </div>
        `;
    });
}
