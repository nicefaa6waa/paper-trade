// Register Service Worker for Android PWA Install
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// Default Gas Fee in SOL
const GAS_FEE = 0.002;

// State - MADE BULLETPROOF AGAINST CORRUPTED DATA
let trades = [];
let walletBalance = 0.000;

try {
    const savedTrades = localStorage.getItem('proPaperTrades');
    if (savedTrades) {
        const parsed = JSON.parse(savedTrades);
        // Ensure the loaded data is actually an array, otherwise reset it
        trades = Array.isArray(parsed) ? parsed : (parsed.trades || []);
    }
} catch (e) {
    console.error("Corrupted trade data found and ignored.", e);
    trades = [];
}

try {
    const savedWallet = localStorage.getItem('proWalletBalance');
    if (savedWallet) {
        walletBalance = parseFloat(savedWallet) || 0.000;
    }
} catch (e) {
    walletBalance = 0.000;
}

// Init Setup - Handle Timezones gracefully
const todayDate = new Date();
const localDateStr = todayDate.getFullYear() + '-' + String(todayDate.getMonth() + 1).padStart(2, '0') + '-' + String(todayDate.getDate()).padStart(2, '0');
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
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    if (element) {
        element.classList.add('active');
    } else {
        const firstNav = document.querySelector('.nav-item');
        if(firstNav) firstNav.classList.add('active');
    }
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

    trades.unshift(newTrade); // Add new trades to the top of the list
    saveData();
    
    document.getElementById('ca').value = '';
    document.getElementById('buyPrice').value = '';
    document.getElementById('buyMC').value = '';
    
    btn.innerText = "Log Trade"; btn.disabled = false;
    document.activeElement.blur(); // Hide Android Keyboard
});

// Handle Sell
function handleSell(tradeId) {
    const sellMC = parseFloat(document.getElementById(`sellMC-${tradeId}`).value);
    const sellPct = parseFloat(document.getElementById(`sellPct-${tradeId}`).value);

    if (isNaN(sellMC) || isNaN(sellPct) || sellPct <= 0) return;

    const tradeIndex = trades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) return;

    let trade = trades[tradeIndex];
    const actualSellPct = Math.min(sellPct, 100 - (Number(trade.soldPercentage) || 0));
    
    const costBasis = (Number(trade.buyPrice) || 0) * (actualSellPct / 100);
    const mcMultiplier = sellMC / (Number(trade.buyMC) || 1); 
    const revenueBeforeGas = costBasis * mcMultiplier;
    
    const pnlSol = revenueBeforeGas - costBasis - GAS_FEE;
    const pnlPct = ((revenueBeforeGas / costBasis) - 1) * 100;

    trade.sells = trade.sells || [];
    trade.sells.push({
        sellMC: sellMC,
        percentage: actualSellPct,
        pnlSol: pnlSol,
        pnlPct: pnlPct,
        revenue: revenueBeforeGas,
        gas: GAS_FEE,
        timestamp: new Date().toISOString()
    });

    trade.soldPercentage = (Number(trade.soldPercentage) || 0) + actualSellPct;
    trade.totalRevenue = (Number(trade.totalRevenue) || 0) + revenueBeforeGas;
    trade.totalGasPaid = (Number(trade.totalGasPaid) || 0) + GAS_FEE;

    walletBalance += (revenueBeforeGas - GAS_FEE);
    updateWalletUI();

    if (trade.soldPercentage >= 100) trade.status = 'closed';

    trades[tradeIndex] = trade;
    saveData();
    document.activeElement.blur(); 
}

// Delete Trade
function deleteTrade(tradeId) {
    if (confirm("Are you sure you want to permanently delete this trade?")) {
        trades = trades.filter(t => t.id !== tradeId);
        saveData();
    }
}

// Save & Render List Views
function saveData() {
    localStorage.setItem('proPaperTrades', JSON.stringify(trades));
    renderUI();
}

function renderUI() {
    renderOpenTrades();
    renderHistory('todayHistoryList', true);
    renderHistory('allHistoryList', false);
}

// CRASH-PROOF FORMATTERS
const formatSol = (val) => {
    const num = Number(val) || 0;
    return `${num > 0 ? '+' : ''}${num.toFixed(3)} SOL`;
};
const formatPct = (val) => {
    const num = Number(val) || 0;
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
};
const getColor = (val) => Number(val) > 0 ? 'text-green' : Number(val) < 0 ? 'text-red' : '';

function renderOpenTrades() {
    const container = document.getElementById('openTradesList');
    container.innerHTML = '';
    const openTrades = trades.filter(t => t.status === 'open').sort((a, b) => new Date(b.date) - new Date(a.date));

    if (openTrades.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px 0;">No active positions.</p>'; return;
    }

    openTrades.forEach(trade => {
        const remainingPct = 100 - (Number(trade.soldPercentage) || 0);
        const safeBuyMC = Number(trade.buyMC) || 0;
        const safeBuyPrice = Number(trade.buyPrice) || 0;
        
        container.innerHTML += `
            <div class="trade-item">
                <div class="trade-header">
                    <img src="${trade.image}" alt="token">
                    <div class="trade-info">
                        <div class="trade-name">${trade.name || 'Unknown'} ($${trade.symbol || '?'})</div>
                        <div class="trade-date">${trade.date} | Entry MC: $${safeBuyMC.toLocaleString()}</div>
                    </div>
                    <button class="btn-small btn-danger" onclick="deleteTrade('${trade.id}')" style="padding: 5px 10px;">🗑️</button>
                </div>
                <div style="font-size: 0.9rem; margin-bottom: 5px;"><strong>Entry:</strong> ${safeBuyPrice} SOL | <strong>Sold:</strong> ${Number(trade.soldPercentage) || 0}%</div>
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
    
    let closedTrades = trades.filter(t => t.status === 'closed');
    if (onlyToday) closedTrades = closedTrades.filter(t => t.date === localDateStr);

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
            const safeRevenue = Number(trade.totalRevenue) || 0;
            const safeBuyPrice = Number(trade.buyPrice) || 0;
            const safeGas = Number(trade.totalGasPaid) || 0;
            const safeBuyMC = Number(trade.buyMC) || 0;

            const netPnl = safeRevenue - safeBuyPrice - safeGas;
            const netPct = safeBuyPrice > 0 ? (netPnl / safeBuyPrice) * 100 : 0;
            
            dailyPnl += netPnl;
            if (netPnl > 0) wins++;

            const sellsHtml = (trade.sells || []).map(s => `Sold ${Number(s.percentage || 0)}% @ $${Number(s.sellMC || 0).toLocaleString()}`).join('<br>');

            tradesHtml += `
                <div class="trade-item">
                    <div class="trade-header">
                        <img src="${trade.image}">
                        <div class="trade-info"><div class="trade-name">${trade.name || 'Unknown'}</div></div>
                        <div style="text-align: right;">
                            <div class="${getColor(netPnl)}">${formatPct(netPct)} <br> <small>${formatSol(netPnl)}</small></div>
                            <button class="btn-small btn-danger" onclick="deleteTrade('${trade.id}')" style="margin-top: 5px; padding: 2px 8px; font-size: 0.75rem;">🗑️</button>
                        </div>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        Entry MC: $${safeBuyMC.toLocaleString()} | Gas: -${safeGas.toFixed(3)}<br>
                        ${sellsHtml}
                    </div>
                </div>
            `;
        });

        const winRate = dayTrades.length > 0 ? ((wins / dayTrades.length) * 100).toFixed(0) : 0;
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

// --- SMARTER BACKUP & RESTORE LOGIC ---
function exportData() {
    const dataStr = JSON.stringify({ trades, walletBalance });
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PaperTrack_Backup_${localDateStr}.json`;
    a.click();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Accept old backup arrays OR new backup objects
            if (Array.isArray(data)) {
                trades = data;
            } else if (data && data.trades) {
                trades = Array.isArray(data.trades) ? data.trades : [];
                if (data.walletBalance !== undefined) walletBalance = Number(data.walletBalance) || 0;
            } else {
                throw new Error("Unrecognized Format");
            }
            
            saveData();
            updateWalletUI();
            alert("Backup restored successfully!");
            if(document.getElementById('statsModal').style.display === 'block') renderMonthlyStats();
        } catch (err) {
            alert("Error restoring backup. Ensure it is a valid JSON backup file.");
            console.error(err);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input so you can re-import if needed
}

// --- PNL CALENDAR LOGIC ---
let currentDate = new Date();

function openStatsModal() {
    document.getElementById('statsModal').style.display = 'block';
    renderMonthlyStats();
}

function closeStatsModal() {
    document.getElementById('statsModal').style.display = 'none';
}

function changeMonth(dir) {
    currentDate.setMonth(currentDate.getMonth() + dir);
    renderMonthlyStats();
}

function renderMonthlyStats() {
    const container = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarMonthLabel');
    container.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    label.innerText = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

    const dailyPnL = {};
    trades.forEach(trade => {
        (trade.sells || []).forEach(sell => {
            const sellDate = new Date(sell.timestamp);
            if(sellDate.getFullYear() === year && sellDate.getMonth() === month) {
                const dateStr = sellDate.getFullYear() + '-' + String(sellDate.getMonth() + 1).padStart(2, '0') + '-' + String(sellDate.getDate()).padStart(2, '0');
                dailyPnL[dateStr] = (dailyPnL[dateStr] || 0) + (Number(sell.pnlSol) || 0);
            }
        });
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let startDay = firstDay - 1; 
    if (startDay === -1) startDay = 6;

    for (let i = 0; i < startDay; i++) {
        container.innerHTML += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const pnl = dailyPnL[dateStr] || 0;
        
        let classes = "calendar-day";
        if (dateStr === localDateStr) classes += " today"; 
        if (pnl > 0) classes += " positive";
        if (pnl < 0) classes += " negative";

        let pnlText = pnl !== 0 ? formatSol(pnl) : "";
        let pnlColorClass = pnl > 0 ? "text-green" : (pnl < 0 ? "text-red" : "");

        container.innerHTML += `
            <div class="${classes}">
                <span class="day-num">${day}</span>
                <span class="day-pnl ${pnlColorClass}">${pnlText}</span>
            </div>
        `;
    }
}
