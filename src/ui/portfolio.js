const PORTFOLIO_KEY = 'portfolio';

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
  // Load initial portfolio
  await loadPortfolioUI(portfolioTable);

  // Add stock button
  addStockBtn?.addEventListener('click', () => openAddStockModal(portfolioTable));

  // Evaluate button
  evaluateBtn?.addEventListener('click', async () => {
    const prompt = promptInput?.value.trim();
    if (!prompt) {
      alert('Vui lòng nhập prompt');
      return;
    }
    await evaluatePortfolio(prompt);
  });

  // Clear portfolio button
  const clearBtn = document.getElementById('clearPortfolioBtn');
  clearBtn?.addEventListener('click', async () => {
    if (confirm('Xác nhận xóa tất cả mã trong danh mục?')) {
      await chrome.storage.local.set({ [PORTFOLIO_KEY]: [] });
      await loadPortfolioUI(portfolioTable);
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
}

export async function loadPortfolioUI(table) {
  const portfolio = await getPortfolio();
  if (!table) return;

  table.innerHTML = '';
  if (portfolio.length === 0) {
    table.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Chưa có mã nào. Nhấn "+ Thêm mã" để thêm.</td></tr>';
    return;
  }

  portfolio.forEach((stock, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${stock.code}</td>
      <td>${stock.entry}</td>
      <td>${stock.quantity}</td>
      <td>${(stock.entry * stock.quantity).toFixed(2)}</td>
      <td style="text-align: center;">
        <button class="edit-btn" data-id="${idx}" title="Sửa">✏️</button>
        <button class="delete-btn" data-id="${idx}" title="Xóa">🗑️</button>
      </td>
    `;
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

  titleEl.textContent = 'Thêm mã chứng khoán';
  codeInput.value = '';
  entryInput.value = '';
  quantityInput.value = '';

  modal.classList.remove('hidden');

  // Remove old listeners
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim().toUpperCase();
    const entry = parseFloat(entryInput.value);
    const quantity = parseFloat(quantityInput.value);

    if (!code || isNaN(entry) || isNaN(quantity)) {
      alert('Vui lòng điền đầy đủ thông tin');
      return;
    }

    await addStock(code, entry, quantity);
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

    titleEl.textContent = 'Sửa mã chứng khoán';
    codeInput.value = stock.code;
    entryInput.value = stock.entry;
    quantityInput.value = stock.quantity;

    modal.classList.remove('hidden');

    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim().toUpperCase();
      const entry = parseFloat(entryInput.value);
      const quantity = parseFloat(quantityInput.value);

      if (!code || isNaN(entry) || isNaN(quantity)) {
        alert('Vui lòng điền đầy đủ thông tin');
        return;
      }

      await updateStock(id, code, entry, quantity);
      modal.classList.add('hidden');
      await loadPortfolioUI(portfolioTable);
    });
  });
}

export async function getPortfolio() {
  const stored = await chrome.storage.local.get([PORTFOLIO_KEY]);
  return Array.isArray(stored[PORTFOLIO_KEY]) ? stored[PORTFOLIO_KEY] : [];
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

  // Send to background to handle ChatGPT input
  chrome.runtime.sendMessage({
    action: 'inputPrompt',
    prompt: fullPrompt,
    skipHistory: false
  }, (response) => {
    if (response?.success) {
      console.log('[Portfolio] Sent to ChatGPT successfully');
      alert('Đã gửi danh mục và prompt tới ChatGPT');
    } else {
      console.error('[Portfolio] Error sending to ChatGPT:', response?.error);
      alert('Lỗi khi gửi tới ChatGPT: ' + (response?.error || 'Không rõ lỗi'));
    }
  });
}
