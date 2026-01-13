const PORTFOLIO_KEY = 'portfolio';
const PORTFOLIO_PROMPT_KEY = 'portfolioPrompt';

import { calculateStockPL, calculatePortfolioTotalPL, formatCurrency, formatPercent, getPLClass } from './portfolioPL.js';
import { AdvancedMarketDataClient } from '../market-data/advanced-client.js';

// Global realtime client
let realtimeClient = null;
let currentSubscriptions = new Map(); // symbol -> unsubscribe function

export async function initPortfolio({
  portfolioPage,
  portfolioBtn,
  portfolioTable,
  addStockBtn,
  stockCodeInput,
  entryInput,
  quantityInput,
  promptInput,
  evaluateBtn,
  editingStockId = null
}) {
  // Load initial portfolio and prompt first
  await loadPortfolioUI(portfolioTable);
  await loadPortfolioPrompt(promptInput);
  
  // Auto-start realtime updates
  try {
    await startRealtimeUpdates(portfolioTable);
    console.log('[Portfolio] Realtime updates started automatically (800ms interval)');
  } catch (err) {
    console.warn('[Portfolio] Failed to start realtime, will use manual updates:', err);
  }

  // Add stock button
  addStockBtn?.addEventListener('click', () => openAddStockModal(portfolioTable));
  
  // Keep backward compatibility - remove addCashBtn listener

  // Evaluate button
  evaluateBtn?.addEventListener('click', async () => {
    const prompt = promptInput?.value.trim();
    if (!prompt) {
      alert('Vui lòng nhập prompt đánh giá trong tab "Cấu hình"');
      return;
    }
    
    try {
      // Auto-save prompt before evaluating
      await chrome.storage.local.set({ [PORTFOLIO_PROMPT_KEY]: prompt });
      console.log('[Portfolio] Prompt saved');
      
      // Wait for evaluate to complete
      const success = await evaluatePortfolio(prompt);
      if (!success) {
        console.error('[Portfolio] Failed to evaluate portfolio');
      }
    } catch (err) {
      console.error('[Portfolio] Evaluate error:', err);
    }
  });

  // Clear portfolio button
  const clearBtn = document.getElementById('clearPortfolioBtn');
  clearBtn?.addEventListener('click', async () => {
    if (confirm('Xác nhận xóa tất cả mã trong danh mục?')) {
      await chrome.storage.local.set({ [PORTFOLIO_KEY]: [] });
      await loadPortfolioUI(portfolioTable);
    }
  });

  // Update prices button - toggle realtime on/off
  const updatePricesBtn = document.getElementById('updatePricesBtn');
  updatePricesBtn?.addEventListener('click', async () => {
    try {
      if (currentSubscriptions.size > 0) {
        // Stop realtime
        stopRealtimeUpdates();
        console.log('[Portfolio] Realtime stopped by user');
      } else {
        // Start realtime
        await startRealtimeUpdates(portfolioTable);
        console.log('[Portfolio] Realtime started by user');
      }
    } catch (err) {
      console.error('[Portfolio] Failed to toggle realtime:', err);
      alert('Không thể bật/tắt cập nhật realtime. Xem console để biết thêm chi tiết.');
    }
  });

  // Modal close buttons
  const portfolioModal = document.getElementById('portfolioModal');
  const closePortfolioModal = document.getElementById('closePortfolioModal');
  const cancelPortfolioBtn = document.getElementById('cancelPortfolioBtn');

  closePortfolioModal?.addEventListener('click', () => {
    portfolioModal?.classList.add('hidden');
  });

  cancelPortfolioBtn?.addEventListener('click', () => {
    portfolioModal?.classList.add('hidden');
  });

  // Price update modal handlers
  const priceUpdateModal = document.getElementById('priceUpdateModal');
  const closePriceModal = document.getElementById('closePriceModal');
  const cancelPriceBtn = document.getElementById('cancelPriceBtn');
  const savePricesBtn = document.getElementById('savePricesBtn');

  closePriceModal?.addEventListener('click', () => {
    priceUpdateModal?.classList.add('hidden');
  });

  cancelPriceBtn?.addEventListener('click', () => {
    priceUpdateModal?.classList.add('hidden');
  });

  savePricesBtn?.addEventListener('click', async () => {
    await savePriceUpdates(portfolioTable);
    priceUpdateModal?.classList.add('hidden');
  });
}

export async function loadPortfolioUI(table) {
  const portfolio = await getPortfolio();
  if (!table) return;

  // Update realtime status UI
  checkRealtimeStatus();

  table.innerHTML = '';
  if (portfolio.length === 0) {
    table.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Chưa có mã nào. Nhấn "+ Thêm mã" để thêm.</td></tr>';
    return;
  }

  // Calculate portfolio P&L
  const portfolioSummary = calculatePortfolioTotalPL(portfolio);
  
  // Display summary
  const summaryEl = document.getElementById('portfolioSummary');
  if (summaryEl && portfolio.some(s => s.currentPrice)) {
    summaryEl.style.display = 'block';
    document.getElementById('totalEntry').textContent = formatCurrency(portfolioSummary.totalEntryValue);
    document.getElementById('currentValue').textContent = formatCurrency(portfolioSummary.totalCurrentValue);
    const plEl = document.getElementById('totalPL');
    plEl.textContent = `${formatCurrency(portfolioSummary.totalPL)} ${formatPercent(portfolioSummary.totalPLPercent)}`;
    plEl.className = `summary-value ${getPLClass(portfolioSummary.totalPL)}`;
  }

  // Sort: regular stocks first, CASH always at the end
  // Create a copy with index mapping to preserve original indices
  const indexedPortfolio = portfolio.map((stock, originalIdx) => ({ stock, originalIdx }));
  indexedPortfolio.sort((a, b) => {
    if (a.stock.code === 'CASH') return 1;
    if (b.stock.code === 'CASH') return -1;
    return 0;
  });

  indexedPortfolio.forEach(({ stock, originalIdx }) => {
    const row = document.createElement('tr');
    const isCash = stock.code === 'CASH';
    
    if (isCash) {
      row.style.backgroundColor = '#f0f9ff';
      row.style.fontWeight = 'bold';
      row.innerHTML = `
        <td>${stock.code}</td>
        <td>-</td>
        <td>-</td>
        <td>${stock.quantity.toFixed(2)}</td>
        <td>-</td>
        <td style="text-align: center;">
          <button class="edit-btn" data-id="${originalIdx}" title="Sửa">✏️</button>
          <button class="delete-btn" data-id="${originalIdx}" title="Xóa">🗑️</button>
        </td>
      `;
    } else {
      const pl = calculateStockPL(stock);
      const plDisplay = pl 
        ? `<span class="${getPLClass(pl.pl)}">${formatCurrency(pl.pl)} ${formatPercent(pl.plPercent)}</span>`
        : '-';
      
      row.innerHTML = `
        <td>${stock.code}</td>
        <td>${stock.entry}</td>
        <td>${stock.currentPrice || '-'}</td>
        <td>${stock.quantity}</td>
        <td>${plDisplay}</td>
        <td style="text-align: center;">
          <button class="edit-btn" data-id="${originalIdx}" title="Sửa">✏️</button>
          <button class="delete-btn" data-id="${originalIdx}" title="Xóa">🗑️</button>
        </td>
      `;
    }
    table.appendChild(row);
  });

  // Add event listeners
  table.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      openEditStockModal(id, table);
    });
  });

  table.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id);
      if (confirm('Xác nhận xóa mã này?')) {
        await deleteStock(id);
        await loadPortfolioUI(table);
      }
    });
  });
}

function openAddStockModal(portfolioTable) {
  const modal = document.getElementById('portfolioModal');
  if (!modal) return;

  const titleEl = modal.querySelector('#portfolioModalTitle');
  const codeInput = modal.querySelector('#stockCodeInput');
  const entryInput = modal.querySelector('#stockEntryInput');
  const quantityInput = modal.querySelector('#stockQuantityInput');
  const saveBtn = modal.querySelector('#saveStockBtn');
  const entryLabel = modal.querySelector('label[for="stockEntryInput"]');
  const quantityLabel = modal.querySelector('label[for="stockQuantityInput"]');

  if (!titleEl || !codeInput || !entryInput || !quantityInput || !saveBtn) {
    console.error('[Portfolio] Modal elements not found');
    return;
  }

  titleEl.textContent = 'Thêm/Sửa mã (hoặc CASH)';
  codeInput.value = '';
  entryInput.value = '';
  quantityInput.value = '';
  
  // Reset to stock mode
  if (entryLabel) entryLabel.style.display = '';
  if (quantityLabel) quantityLabel.textContent = 'Khối lượng:';
  entryInput.style.display = '';
  codeInput.placeholder = 'VNM, BID, CASH, ...';
  codeInput.disabled = false;
  codeInput.style.backgroundColor = '';

  modal.classList.remove('hidden');

  // Remove old listeners - properly clean up before replacing
  const saveBtn_current = modal.querySelector('#saveStockBtn');
  const newSaveBtn = saveBtn_current.cloneNode(true);
  saveBtn_current.parentNode.replaceChild(newSaveBtn, saveBtn_current);

  newSaveBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim().toUpperCase();
    const entry = parseFloat(entryInput.value);
    const quantity = parseFloat(quantityInput.value);

    if (!code || isNaN(quantity)) {
      alert('Vui lòng nhập Mã và Khối lượng');
      return;
    }
    
    // For CASH, entry is not needed
    if (code !== 'CASH' && isNaN(entry)) {
      alert('Vui lòng nhập Entry');
      return;
    }

    const portfolio = await getPortfolio();
    const existingIdx = portfolio.findIndex(s => s.code === code);
    
    if (existingIdx >= 0) {
      // Stock already exists - add to quantity
      const existing = portfolio[existingIdx];
      const newQuantity = existing.quantity + quantity;
      await updateStock(existingIdx, code, existing.entry, newQuantity);
      console.log(`[Portfolio] Updated ${code}: +${quantity} (Total: ${newQuantity})`);
    } else {
      // New stock
      const finalEntry = code === 'CASH' ? 1 : entry;
      await addStock(code, finalEntry, quantity);
      console.log(`[Portfolio] Added ${code}: ${quantity}`);
    }
    
    modal.classList.add('hidden');
    await loadPortfolioUI(portfolioTable);
  });
}

function openEditStockModal(id, portfolioTable) {
  const modal = document.getElementById('portfolioModal');
  if (!modal) return;

  getPortfolio().then(portfolio => {
    const stock = portfolio[id];
    if (!stock) return;

    const titleEl = modal.querySelector('#portfolioModalTitle');
    const codeInput = modal.querySelector('#stockCodeInput');
    const entryInput = modal.querySelector('#stockEntryInput');
    const quantityInput = modal.querySelector('#stockQuantityInput');
    const saveBtn = modal.querySelector('#saveStockBtn');
    const entryLabel = modal.querySelector('label[for="stockEntryInput"]');
    const quantityLabel = modal.querySelector('label[for="stockQuantityInput"]');

    if (!titleEl || !codeInput || !entryInput || !quantityInput || !saveBtn) {
      console.error('[Portfolio] Modal elements not found');
      return;
    }

    const isCash = stock.code === 'CASH';
    titleEl.textContent = isCash ? 'Sửa CASH' : 'Sửa mã chứng khoán';
    codeInput.value = stock.code;
    entryInput.value = stock.entry;
    quantityInput.value = stock.quantity;
    
    // Hide entry field for cash
    if (isCash) {
      if (entryLabel) entryLabel.style.display = 'none';
      if (quantityLabel) quantityLabel.textContent = 'Số tiền sẵn sàng:';
      entryInput.style.display = 'none';
      codeInput.disabled = true;
    } else {
      if (entryLabel) entryLabel.style.display = '';
      if (quantityLabel) quantityLabel.textContent = 'Khối lượng:';
      entryInput.style.display = '';
      codeInput.disabled = false;
    }

    modal.classList.remove('hidden');

    // Remove old listeners - properly clean up before replacing
    const saveBtn_old = modal.querySelector('#saveStockBtn');
    const newSaveBtn = saveBtn_old.cloneNode(true);
    saveBtn_old.parentNode.replaceChild(newSaveBtn, saveBtn_old);

    newSaveBtn.addEventListener('click', async () => {
      const isCash = stock.code === 'CASH';
      const code = codeInput.value.trim();
      const quantity = parseFloat(quantityInput.value);

      if (isNaN(quantity)) {
        alert('Vui lòng điền thông tin');
        return;
      }
      
      if (isCash) {
        // For cash, always use entry=1
        await updateStock(id, code, 1, quantity);
      } else {
        const entry = parseFloat(entryInput.value);
        if (!code || isNaN(entry)) {
          alert('Vui lòng điền đầy đủ thông tin');
          return;
        }
        await updateStock(id, code, entry, quantity);
      }
      modal.classList.add('hidden');
      await loadPortfolioUI(portfolioTable);
    });
  });
}

export async function getPortfolio() {
  const stored = await chrome.storage.local.get([PORTFOLIO_KEY]);
  return Array.isArray(stored[PORTFOLIO_KEY]) ? stored[PORTFOLIO_KEY] : [];
}

export async function loadPortfolioPrompt(promptInput) {
  if (!promptInput) return;
  const stored = await chrome.storage.local.get([PORTFOLIO_PROMPT_KEY]);
  promptInput.value = stored[PORTFOLIO_PROMPT_KEY] || '';
}

export async function addStock(code, entry, quantity) {
  const portfolio = await getPortfolio();
  portfolio.push({ code, entry: parseFloat(entry), quantity: parseFloat(quantity), timestamp: Date.now() });
  await chrome.storage.local.set({ [PORTFOLIO_KEY]: portfolio });
  console.log('[Portfolio] Stock added:', code);
}

export async function updateStock(id, code, entry, quantity) {
  const portfolio = await getPortfolio();
  if (portfolio[id]) {
    portfolio[id] = { code, entry: parseFloat(entry), quantity: parseFloat(quantity), timestamp: Date.now() };
    await chrome.storage.local.set({ [PORTFOLIO_KEY]: portfolio });
    console.log('[Portfolio] Stock updated:', code);
  }
}

export async function deleteStock(id) {
  const portfolio = await getPortfolio();
  portfolio.splice(id, 1);
  await chrome.storage.local.set({ [PORTFOLIO_KEY]: portfolio });
  console.log('[Portfolio] Stock deleted');
}

export async function evaluatePortfolio(prompt) {
  const portfolio = await getPortfolio();
  
  // Build portfolio string
  let portfolioText = '## DANH MỤC HIỆN CÓ\n\n';
  portfolioText += '| Mã | Entry | Khối lượng | Giá trị |\n';
  portfolioText += '|----|----|----|-|\n';
  
  let totalValue = 0;
  portfolio.forEach(stock => {
    const value = stock.entry * stock.quantity;
    totalValue += value;
    portfolioText += `| ${stock.code} | ${stock.entry} | ${stock.quantity} | ${value.toFixed(2)} |\n`;
  });
  
  portfolioText += `\n**Tổng giá trị danh mục: ${totalValue.toFixed(2)}**\n\n`;

  // Combine with prompt
  const fullPrompt = `${portfolioText}\n## YÊU CẦU\n${prompt}`;

  console.log('[Portfolio] Evaluate request:', fullPrompt);

  // Send to background to handle ChatGPT input (same as Run button)
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'send_prompt',
      prompt: fullPrompt
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Portfolio] Error:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      if (!response || response.status !== 'ok') {
        console.error('[Portfolio] Failed to send prompt:', response?.error);
        resolve(false);
        return;
      }
      console.log('[Portfolio] Sent to ChatGPT successfully, runId:', response.runId);
      resolve(true);
    });
  });
}

// Price update functions
async function openPriceUpdateModal(portfolioTable) {
  const portfolio = await getPortfolio();
  const priceUpdateList = document.getElementById('priceUpdateList');
  
  if (!priceUpdateList) return;

  // Filter out CASH
  const stocks = portfolio.filter(s => s.code !== 'CASH');
  
  priceUpdateList.innerHTML = stocks.map(stock => `
    <div class="price-update-item">
      <label>${stock.code}</label>
      <input type="number" class="price-input" data-code="${stock.code}" 
             value="${stock.currentPrice || stock.entry}" 
             step="0.1" min="0" placeholder="Current price" />
      <span style="font-size: 11px; color: #666;">(Entry: ${stock.entry})</span>
    </div>
  `).join('');

  const priceUpdateModal = document.getElementById('priceUpdateModal');
  priceUpdateModal?.classList.remove('hidden');
}

async function savePriceUpdates(portfolioTable) {
  const portfolio = await getPortfolio();
  const priceInputs = document.querySelectorAll('.price-input');
  
  let updated = false;
  priceInputs.forEach(input => {
    const code = input.dataset.code;
    const price = parseFloat(input.value);
    
    if (price > 0) {
      const stock = portfolio.find(s => s.code === code);
      if (stock) {
        stock.currentPrice = price;
        stock.priceUpdatedAt = new Date().toISOString();
        updated = true;
      }
    }
  });

  if (updated) {
    await chrome.storage.local.set({ [PORTFOLIO_KEY]: portfolio });
    await loadPortfolioUI(portfolioTable);
    console.log('[Portfolio] Prices updated');
  }
}

// ========== REALTIME FUNCTIONS ==========
// NOTE: Realtime currently disabled due to CORS policy from SSI API
// SSI only allows origin 'https://iboard.ssi.com.vn', not chrome-extension://
// Solutions:
//   1. Use content script proxy (inject into iboard.ssi.com.vn)
//   2. Setup backend proxy server
//   3. Use manual price updates (current solution)

function initRealtimeClient() {
  if (!realtimeClient) {
    realtimeClient = new AdvancedMarketDataClient({
      realtimeEnabled: true,
      pollInterval: 60000, // Poll every 60 seconds
      minUpdateInterval: 60000, // Update callback every 60 seconds
      debug: true // Enable debug to see logs
    });
    
    console.log('[Portfolio] Realtime client initialized (60s updates)');
  }
  return realtimeClient;
}

async function startRealtimeUpdates(portfolioTable) {
  try {
    if (!realtimeClient) {
      initRealtimeClient();
    }
    
    // Wait a bit for client to initialize
    if (!realtimeClient) {
      throw new Error('Realtime client failed to initialize');
    }
    
    const portfolio = await getPortfolio();
    const stocks = portfolio.filter(s => s.code !== 'CASH');
    
    if (stocks.length === 0) {
      console.log('[Portfolio] No stocks to subscribe');
      return;
    }
    
    // Unsubscribe old ones
    currentSubscriptions.forEach((unsubscribe, symbol) => {
      try {
        console.log(`[Portfolio] Unsubscribing ${symbol}`);
        unsubscribe(); // Call the unsubscribe function
      } catch (e) {
        console.warn('[Portfolio] Failed to unsubscribe:', symbol, e);
      }
    });
    currentSubscriptions.clear();
  
    // Subscribe to all stocks
    stocks.forEach(stock => {
      const symbol = stock.code;
      try {
        console.log(`[Portfolio] Subscribing to ${symbol}`);
        const unsubscribe = realtimeClient.subscribe(symbol, async (data) => {
          try {
            console.log(`[Portfolio] Price update: ${symbol} = ${data.price}`);
            // Update price in storage
            const portfolio = await getPortfolio();
            const stockInPortfolio = portfolio.find(s => s.code === symbol);
            if (stockInPortfolio) {
              stockInPortfolio.currentPrice = data.price;
              stockInPortfolio.priceUpdatedAt = new Date().toISOString();
              await chrome.storage.local.set({ [PORTFOLIO_KEY]: portfolio });
              
              // Update UI only if table exists
              if (portfolioTable) {
                await loadPortfolioUI(portfolioTable);
              }
            }
          } catch (err) {
            console.error(`[Portfolio] Error updating ${symbol}:`, err);
          }
        });
        currentSubscriptions.set(symbol, unsubscribe); // Store unsubscribe function
      } catch (err) {
        console.error(`[Portfolio] Failed to subscribe ${symbol}:`, err);
      }
    });
    
    console.log(`[Portfolio] Subscribed to ${stocks.length} stocks (realtime 800ms)`);
    
    // Update status
    checkRealtimeStatus();
  } catch (err) {
    console.error('[Portfolio] startRealtimeUpdates failed:', err);
    throw err;
  }
}

function stopRealtimeUpdates() {
  if (realtimeClient) {
    currentSubscriptions.forEach((unsubscribe, symbol) => {
      try {
        console.log(`[Portfolio] Stopping realtime for ${symbol}`);
        unsubscribe(); // Call unsubscribe function
      } catch (err) {
        console.error(`[Portfolio] Error unsubscribing ${symbol}:`, err);
      }
    });
    currentSubscriptions.clear();
    console.log('[Portfolio] Stopped realtime updates');
    
    // Update status
    checkRealtimeStatus();
  }
}

function updateRealtimeStatus(connected) {
  const statusEl = document.getElementById('realtimeStatus');
  if (statusEl) {
    statusEl.textContent = connected ? '🟢 Realtime (800ms)' : '🔴 Offline';
    statusEl.style.color = connected ? '#4caf50' : '#999';
  }
}

// Check and update status based on subscriptions
function checkRealtimeStatus() {
  const isActive = currentSubscriptions.size > 0;
  updateRealtimeStatus(isActive);
  
  const updatePricesBtn = document.getElementById('updatePricesBtn');
  if (updatePricesBtn) {
    if (isActive) {
      updatePricesBtn.textContent = '⏸️ Tắt Realtime';
      updatePricesBtn.style.backgroundColor = '#4caf50';
    } else {
      updatePricesBtn.textContent = '▶️ Bật Realtime';
      updatePricesBtn.style.backgroundColor = '#666';
    }
  }
}
