const PORTFOLIO_KEY = 'portfolio';
const PORTFOLIO_PROMPT_KEY = 'portfolioPrompt';

import { calculateStockPL, calculatePortfolioTotalPL, formatCurrency, formatPercent, getPLClass } from './portfolioPL.js';
import { AdvancedMarketDataClient } from '../market-data/advanced-client.js';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
  teaStockBtn,
  teaStockPromptInput,
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

  // Tea stock button - sends tea stock prompt to ChatGPT
  teaStockBtn?.addEventListener('click', async () => {
    const prompt = teaStockPromptInput?.value.trim();
    if (!prompt) {
      alert('Vui lòng nhập prompt tìm cổ phiếu trà đá trong tab "Cấu hình"');
      return;
    }

    try {
      // Send prompt to ChatGPT via background using proper message format
      const message = {
        v: 1,
        type: MESSAGE_TYPES.SEND_PROMPT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          prompt: prompt,
          options: {
            createNewChat: true,
            focusTab: true
          }
        }
      };
      
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
          resolve(response);
        });
      });

      if (response && response.type !== MESSAGE_TYPES.ERROR) {
        console.log('[Portfolio] Tea stock prompt sent to ChatGPT');
      } else {
        console.error('[Portfolio] Failed to send tea stock prompt:', response);
        alert('Lỗi gửi prompt. Vui lòng mở tab ChatGPT.');
      }
    } catch (err) {
      console.error('[Portfolio] Tea stock error:', err);
      alert('Lỗi: ' + err.message);
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
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.style.textAlign = 'center';
    cell.style.padding = '20px';
    cell.textContent = 'Chưa có mã nào. Nhấn "+ Thêm mã" để thêm.';
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
        <td>${escapeHtml(stock.code)}</td>
        <td>-</td>
        <td>-</td>
        <td>${stock.quantity.toFixed(2)}</td>
        <td>-</td>
        <td style="text-align: center;">
          <div class="portfolio-actions-dropdown">
            <button class="portfolio-actions-btn" title="Hành động"><i class="fas fa-ellipsis-vertical"></i></button>
            <div class="portfolio-actions-menu">
              <button class="action-edit" data-id="${originalIdx}" title="Sửa"><i class="fas fa-edit"></i> Sửa</button>
              <button class="action-delete" data-id="${originalIdx}" title="Xóa"><i class="fas fa-trash"></i> Xóa</button>
            </div>
          </div>
        </td>
      `;
    } else {
      const pl = calculateStockPL(stock);
      const plDisplay = pl 
        ? `<span class="${getPLClass(pl.pl)}">${formatCurrency(pl.pl)} ${formatPercent(pl.plPercent)}</span>`
        : '-';
      
      row.innerHTML = `
        <td>${escapeHtml(stock.code)}</td>
        <td>${stock.entry}</td>
        <td>${stock.currentPrice || '-'}</td>
        <td>${stock.quantity}</td>
        <td>${plDisplay}</td>
        <td style="text-align: center;">
          <div class="portfolio-actions-dropdown">
            <button class="portfolio-actions-btn" title="Hành động"><i class="fas fa-ellipsis-vertical"></i></button>
            <div class="portfolio-actions-menu">
              <button class="action-edit" data-id="${originalIdx}" title="Sửa"><i class="fas fa-edit"></i> Sửa</button>
              <button class="action-delete" data-id="${originalIdx}" title="Xóa"><i class="fas fa-trash"></i> Xóa</button>
              <button class="action-evaluate" data-code="${escapeHtml(stock.code)}" title="Đánh giá"><i class="fas fa-magnifying-glass"></i> Đánh giá</button>
            </div>
          </div>
        </td>
      `;
    }
    table.appendChild(row);
  });

  // Add event listeners for dropdown toggle
  table.querySelectorAll('.portfolio-actions-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      // Close all other menus
      document.querySelectorAll('.portfolio-actions-menu.open').forEach(m => {
        if (m !== menu) m.classList.remove('open');
      });
      menu.classList.toggle('open');
    });
  });

  // Add event listeners for edit action
  table.querySelectorAll('.action-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(e.target.closest('button').dataset.id);
      // Close menu
      e.target.closest('.portfolio-actions-menu').classList.remove('open');
      openEditStockModal(id, table);
    });
  });

  // Add event listeners for delete action
  table.querySelectorAll('.action-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(e.target.closest('button').dataset.id);
      // Close menu
      e.target.closest('.portfolio-actions-menu').classList.remove('open');
      if (confirm('Xác nhận xóa mã này?')) {
        await deleteStock(id);
        await loadPortfolioUI(table);
      }
    });
  });

  // Add event listeners for evaluate action
  table.querySelectorAll('.action-evaluate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = e.target.closest('button').dataset.code;
      // Close menu
      e.target.closest('.portfolio-actions-menu').classList.remove('open');
      await evaluateStock(code);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.portfolio-actions-menu.open').forEach(menu => {
      menu.classList.remove('open');
    });
  });
}

// X51LABS-95: Extract common modal logic
function getModalElements() {
  const modal = document.getElementById('portfolioModal');
  if (!modal) return null;

  const elements = {
    modal,
    titleEl: modal.querySelector('#portfolioModalTitle'),
    codeInput: modal.querySelector('#stockCodeInput'),
    entryInput: modal.querySelector('#stockEntryInput'),
    quantityInput: modal.querySelector('#stockQuantityInput'),
    saveBtn: modal.querySelector('#saveStockBtn'),
    entryLabel: modal.querySelector('label[for="stockEntryInput"]'),
    quantityLabel: modal.querySelector('label[for="stockQuantityInput"]')
  };

  if (!elements.titleEl || !elements.codeInput || !elements.entryInput || !elements.quantityInput || !elements.saveBtn) {
    console.error('[Portfolio] Modal elements not found');
    return null;
  }

  return elements;
}

// X51LABS-95: Extract modal field configuration
function configureModalFields(elements, config) {
  const { titleEl, codeInput, entryInput, quantityInput, entryLabel, quantityLabel } = elements;
  const { title, code = '', entry = '', quantity = '', isCash = false } = config;

  titleEl.textContent = title;
  codeInput.value = code;
  entryInput.value = entry;
  quantityInput.value = quantity;

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
    codeInput.placeholder = 'VNM, BID, CASH, ...';
    codeInput.style.backgroundColor = '';
  }
}

// X51LABS-95: Extract save button setup
function setupModalSaveButton(elements, onSave) {
  const { modal, saveBtn } = elements;
  
  // Replace button to remove old listeners
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  
  newSaveBtn.addEventListener('click', async () => {
    await onSave();
    modal.classList.add('hidden');
  });
}

function openAddStockModal(portfolioTable) {
  const elements = getModalElements();
  if (!elements) return;

  // X51LABS-95: Use extracted helpers
  configureModalFields(elements, {
    title: 'Thêm/Sửa mã (hoặc CASH)'
  });

  elements.modal.classList.remove('hidden');

  // X51LABS-95: Use extracted save handler
  setupModalSaveButton(elements, async () => {
    const { codeInput, entryInput, quantityInput } = elements;
    const code = codeInput.value.trim().toUpperCase();
    const entry = parseFloat(entryInput.value);
    const quantity = parseFloat(quantityInput.value);

    if (!code || isNaN(quantity)) {
      alert('Vui lòng nhập Mã và Khối lượng');
      return;
    }
    
    if (code !== 'CASH' && isNaN(entry)) {
      alert('Vui lòng nhập Entry');
      return;
    }

    const portfolio = await getPortfolio();
    const existingIdx = portfolio.findIndex(s => s.code === code);
    
    if (existingIdx >= 0) {
      const existing = portfolio[existingIdx];
      const newQuantity = existing.quantity + quantity;
      await updateStock(existingIdx, code, existing.entry, newQuantity);
      console.log(`[Portfolio] Updated ${code}: +${quantity} (Total: ${newQuantity})`);
    } else {
      const finalEntry = code === 'CASH' ? 1 : entry;
      await addStock(code, finalEntry, quantity);
      console.log(`[Portfolio] Added ${code}: ${quantity}`);
    }
    
    await loadPortfolioUI(portfolioTable);
  });
}

function openEditStockModal(id, portfolioTable) {
  getPortfolio().then(portfolio => {
    const stock = portfolio[id];
    if (!stock) return;

    // X51LABS-95: Use extracted helpers
    const elements = getModalElements();
    if (!elements) return;

    const isCash = stock.code === 'CASH';
    configureModalFields(elements, {
      title: isCash ? 'Sửa CASH' : 'Sửa mã chứng khoán',
      code: stock.code,
      entry: stock.entry,
      quantity: stock.quantity,
      isCash
    });

    elements.modal.classList.remove('hidden');

    setupModalSaveButton(elements, async () => {
      const { codeInput, entryInput, quantityInput } = elements;
      const code = codeInput.value.trim();
      const quantity = parseFloat(quantityInput.value);

      if (isNaN(quantity)) {
        alert('Vui lòng điền thông tin');
        return;
      }
      
      if (isCash) {
        await updateStock(id, code, 1, quantity);
      } else {
        const entry = parseFloat(entryInput.value);
        if (!code || isNaN(entry)) {
          alert('Vui lòng điền đầy đủ thông tin');
          return;
        }
        await updateStock(id, code, entry, quantity);
      }
      
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

  // Send to background using proper message format
  return new Promise((resolve) => {
    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt: fullPrompt,
        options: {
          createNewChat: true,
          focusTab: true
        }
      }
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Portfolio] Error:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      if (!response || response.type === MESSAGE_TYPES.ERROR) {
        console.error('[Portfolio] Failed to send prompt:', response?.error);
        resolve(false);
        return;
      }
      console.log('[Portfolio] Sent to ChatGPT successfully');
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
      <label>${escapeHtml(stock.code)}</label>
      <input type="number" class="price-input" data-code="${escapeHtml(stock.code)}" 
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
    // X51LABS-68: Detect debug mode from manifest version_name
    const isDebugMode = (() => {
      try {
        const manifest = chrome.runtime.getManifest();
        return manifest.version_name?.includes('dev') || 
               manifest.version_name?.includes('debug') ||
               false;
      } catch (e) {
        return false; // Production default
      }
    })();
    
    realtimeClient = new AdvancedMarketDataClient({
      realtimeEnabled: true,
      pollInterval: 60000, // Poll every 60 seconds
      minUpdateInterval: 60000, // Update callback every 60 seconds
      debug: isDebugMode // X51LABS-68: Auto-detect debug mode
    });
    
    console.log('[Portfolio] Realtime client initialized (60s updates), debug:', isDebugMode);
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

/**
 * Evaluate a stock by sending evaluation request to ChatGPT
 */
async function evaluateStock(stockCode) {
  try {
    const settings = await chrome.storage.local.get('stockEvalPrompt');
    let evalPrompt = settings.stockEvalPrompt || 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
    
    const prompt = evalPrompt.replace('{SYMBOL}', stockCode);
    
    // Get current portfolio for context
    const portfolio = await getPortfolio();
    const stock = portfolio.find(s => s.code === stockCode);
    
    let fullPrompt = prompt;
    if (stock) {
      const context = `Mã: ${stock.code}, Entry: ${stock.entry}, Giá hiện tại: ${stock.currentPrice || 'N/A'}, Khối lượng: ${stock.quantity}`;
      fullPrompt = `${prompt}\n\nThông tin hiện tại: ${context}`;
    }
    
    console.log('[Portfolio] Sending stock evaluation:', { stockCode, prompt: fullPrompt });
    
    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt: fullPrompt,
        options: {
          createNewChat: true,
          focusTab: true
        }
      }
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        alert('Lỗi: ' + chrome.runtime.lastError.message);
        return;
      }
      if (response && response.type !== MESSAGE_TYPES.ERROR) {
        console.log('[Portfolio] Stock evaluation sent successfully');
      } else {
        alert('Không thể gửi đánh giá!');
      }
    });
  } catch (err) {
    console.error('[Portfolio] Error evaluating stock:', err);
    alert('Lỗi khi đánh giá mã: ' + err.message);
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
