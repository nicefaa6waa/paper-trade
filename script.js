// Register Service Worker for Android PWA Install
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// State Data Loader - BULLETPROOF
let trades = [];
let walletBalance = 0.000;
let botSettings = { buyPrio: 0.001, buyTip: 0.005, buySlip: 5, sellPrio: 0.001, sellTip: 0.005, sellSlip: 5 };

try {
    const savedTrades = localStorage.getItem('proPaperTrades');
    if (savedTrades) {
        const parsed = JSON.parse(savedTrades);
        trades = Array.isArray(parsed) ? parsed : (parsed.trades || []);
    }
} catch (e) { trades = []; }

try {
    const savedWallet = localStorage.getItem('proWalletBalance');
    if (savedWallet) walletBalance = parseFloat(savedWallet) || 0.000;
} catch (e) { walletBalance = 0.000; }

try {
    const savedSettings = localStorage.getItem('proBotSettings');
    if (savedSettings) botSettings = { ...botSettings, ...JSON.parse(savedSettings) };
} catch (e) {}

// Init Setup
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

// 🪂 SETTINGS MODAL LOGIC
function openSettingsModal() {
    document.getElementById('setBuyPrio').value = botSettings.buyPrio;
    document.getElementById('setBuyTip').value = botSettings.buyTip;
    document.getElementById('setBuySlip').value = botSettings.buySlip;
    document.getElementById('setSellPrio').value = botSettings.sellPrio;
    document.getElementById('setSellTip').value = botSettings.sellTip;
    document.getElementById('setSellSlip').value = botSettings.sellSlip;
    document.getElementById('settingsModal').style.display = 'block';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
    botSettings = {
        buyPrio: parseFloat(document.getElementById('setBuyPrio').value) || 0,
        buyTip: parseFloat(document.getElementById('setBuyTip').value) || 0,
        buySlip: parseFloat(document.getElementById('setBuySlip').value) || 0,
        sellPrio: parseFloat(document.getElementById('setSellPrio').value) || 0,
        sellTip: parseFloat(document.getElementById('setSellTip').value) || 0,
        sellSlip: parseFloat(document.getElementById('setSellSlip').value) || 0
    };
    localStorage.setItem('proBotSettings', JSON.stringify(botSettings));
    closeSettingsModal();
}

// Tab Navigation
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

// DUAL-FETCH TOKEN INFO (Pump.fun -> DexScreener Fallback)
async function fetchTokenInfo(ca) {
    // 1. Try Pump.fun API directly (Best for instant new token launches)
    try {
        const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${ca}`);
        if (pumpRes.ok) {
            const pumpData = await pumpRes.json();
            if (pumpData && pumpData.name) {
                return {
                    name: pumpData.name,
                    symbol: pumpData.symbol,
                    image: pumpData.image_uri || 'https://via.placeholder.com/32?text=?'
                };
            }
        }
    } catch (e) { console.log("Not a pump coin, falling back to DexScreener..."); }

    // 2. Fallback to DexScreener for Raydium/Established coins
    try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
        const data = await dexRes.json();
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
    const targetMC = parseFloat(document.getElementById('buyMC').value);

    if (!caInput || isNaN(buyPrice) || isNaN(targetMC)) return;

    // Apply Buy Presets
    const totalBuyFee = botSettings.buyPrio + botSettings.buyTip;
    const executedBuyMC = targetMC * (1 + (botSettings.buySlip / 100)); // Slippage makes entry MC worse

    walletBalance -= (buyPrice + totalBuyFee);
    updateWalletUI();

    btn.innerText = "Fetching Token..."; btn.disabled = true;
    const tokenInfo = await fetchTokenInfo(caInput);

    const newTrade = {
        id: Date.now().toString(),
        date: dateInput,
        ca: caInput,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        image: tokenInfo.image,
        buyPrice: buyPrice,
        targetBuyMC: targetMC,
        executedBuyMC: executedBuyMC, // Actual MC executed due to slippage
        status: 'open',
        soldPercentage: 0,
        totalRevenue: 0,
        totalGasPaid: totalBuyFee,
        sells: []
    };

    trades.unshift(newTrade);
    saveData();
    
    document.getElementById('ca').value = '';
    document.getElementById('buyPrice').value = '';
    document.getElementById('buyMC').value = '';
    
    btn.innerText = "Log Trade"; btn.disabled = false;
    document.activeElement.blur(); 
});

// Handle Sell
function handleSell(tradeId) {
    const targetSellMC = parseFloat(document.getElementById(`sellMC-${tradeId}`).value);
    const sellPct = parseFloat(document.getElementById(`sellPct-${tradeId}`).value);

    if (isNaN(targetSellMC) || isNaN(sellPct) || sellPct <= 0) return;

    const tradeIndex = trades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) return;

    let trade = trades[tradeIndex];
    const actualSellPct = Math.min(sellPct, 100 - (Number(trade.soldPercentage) || 0));
    
    // Apply Sell Presets
    const totalSellFee = botSettings.sellPrio + botSettings.sellTip;
    const executedSellMC = targetSellMC * (1 - (botSettings.sellSlip / 100)); // Slippage reduces exit MC
    
    const costBasis = (Number(trade.buyPrice) || 0) * (actualSellPct / 100);
    const mcMultiplier = executedSellMC / (Number(trade.executedBuyMC) || 1); 
    const revenueBeforeGas = costBasis * mcMultiplier;
    
    const pnlSol = revenueBeforeGas - costBasis - totalSellFee;
    const pnlPct = ((revenueBeforeGas / costBasis) - 1) * 100;

    trade.sells = trade.sells || [];
    trade.sells.push({
        targetSellMC: targetSellMC,
        executedSellMC: executedSellMC,
        percentage: actualSellPct,
        pnlSol: pnlSol,
        pnlPct: pnlPct,
        revenue: revenueBeforeGas,
        gas: totalSellFee,
        timestamp: new Date().toISOString()
    });

    trade.soldPercentage = (Number(trade.soldPercentage) || 0) + actualSellPct;
    trade.totalRevenue = (Number(trade.totalRevenue) || 0) + revenueBeforeGas;
    trade.totalGasPaid = (Number(trade.totalGasPaid) || 0) + totalSellFee;

    walletBalance += (revenueBeforeGas - totalSellFee);
    updateWalletUI();

    if (trade.soldPercentage >= 100) trade.status = 'closed';

    trades[tradeIndex] = trade;
    saveData();
    document.activeElement.blur(); 
}

// Delete Trade
function deleteTrade(tradeId) {
    if (confirm("Permanently delete this trade log?")) {
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
        // Fallback to buyMC if executedBuyMC is missing from an old save
        const safeBuyMC = Number(trade.executedBuyMC) || Number(trade.buyMC) || 0; 
        const safeBuyPrice = Number(trade.buyPrice) || 0;
        
        container.innerHTML += `
            <div class="trade-item">
                <div class="trade-header">
                    <img src="${trade.image}" alt="token">
                    <div class="trade-info">
                        <div class="trade-name">${trade.name || 'Unknown'} ($${trade.symbol || '?'})</div>
                        <div class="trade-date">${trade.date} | Executed Entry: $${safeBuyMC.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                    </div>
                    <button class="btn-remove" onclick="deleteTrade('${trade.id}')" title="Remove">✕</button>
                </div>
                <div style="font-size: 0.9rem; margin-bottom: 5px; display: flex; justify-content: space-between;">
                    <span><strong>Size:</strong> ${safeBuyPrice} SOL</span>
                    <span><strong>Sold:</strong> ${Number(trade.soldPercentage) || 0}%</span>
                </div>
                <div class="sell-form">
                    <div class="input-group" style="margin-bottom:0">
                        <label>Target MC ($)</label>
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
            const safeBuyMC = Number(trade.executedBuyMC) || Number(trade.buyMC) || 0;

            const netPnl = safeRevenue - safeBuyPrice - safeGas;
            const netPct = safeBuyPrice > 0 ? (netPnl / safeBuyPrice) * 100 : 0;
            
            dailyPnl += netPnl;
            if (netPnl > 0) wins++;

            // Fallback for older saves that used "sellMC" directly without slippage calculations
            const sellsHtml = (trade.sells || []).map(s => {
                const finalMC = Number(s.executedSellMC) || Number(s.sellMC) || 0;
                return `Sold ${Number(s.percentage || 0)}% @ $${finalMC.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
            }).join('<br>');

            tradesHtml += `
                <div class="trade-item">
                    <div class="trade-header">
                        <img src="${trade.image}">
                        <div class="trade-info"><div class="trade-name">${trade.name || 'Unknown'}</div></div>
                        <div style="text-align: right;">
                            <div class="${getColor(netPnl)}">${formatPct(netPct)} <br> <small>${formatSol(netPnl)}</small></div>
                            <button class="btn-remove" onclick="deleteTrade('${trade.id}')" style="margin-top: 5px; margin-left: auto; padding:0; width: 24px; height: 24px; font-size: 12px;" title="Remove">✕</button>
                        </div>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        Exec. Entry MC: $${safeBuyMC.toLocaleString(undefined, {maximumFractionDigits: 0})} | Total Fees: -${safeGas.toFixed(3)}<br>
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

// --- BACKUP & RESTORE LOGIC ---
function exportData() {
    const dataStr = JSON.stringify({ trades, walletBalance, botSettings });
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
            if (Array.isArray(data)) {
                trades = data;
            } else if (data && data.trades) {
                trades = Array.isArray(data.trades) ? data.trades : [];
                if (data.walletBalance !== undefined) walletBalance = Number(data.walletBalance) || 0;
                if (data.botSettings) botSettings = { ...botSettings, ...data.botSettings };
            } else { throw new Error("Unrecognized Format"); }
            
            saveData();
            updateWalletUI();
            localStorage.setItem('proBotSettings', JSON.stringify(botSettings));
            alert("Backup restored successfully!");
            if(document.getElementById('statsModal').style.display === 'block') renderMonthlyStats();
        } catch (err) { alert("Error restoring backup."); }
    };
    reader.readAsText(file);
    event.target.value = ''; 
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
