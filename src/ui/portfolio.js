const PORTFOLIO_KEY = "portfolio";
const PORTFOLIO_PROMPT_KEY = "portfolioPrompt";
const CHAT_HISTORY_KEY = "chatHistory";
const MAX_CHAT_HISTORY = 100;

import {
  calculateStockPL,
  calculatePortfolioTotalPL,
  formatCurrency,
  formatPercent,
  getPLClass,
} from "./portfolioPL.js";
import { AdvancedMarketDataClient } from "../market-data/advanced-client.js";
import { MESSAGE_TYPES } from "../shared/messageSchema.js";
import { generateCorrelationId } from "../logger.js";

// ✅ Import loadAndDisplayHistory from results to reload history after HISTORY_UPDATE
let resultsModule = null;
export function setResultsModule(module) {
  resultsModule = module;
  console.log("[Portfolio] Results module set for history reload");
}

// ✅ GPT-FIX: Message-based Portfolio Operations (Supabase-backed)
/**
 * ✅ Get portfolio from Supabase via background handler
 * Transform Supabase format to UI format
 */
async function getPortfolioFromSupabase() {
  console.log("[Portfolio] getPortfolioFromSupabase called");
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
    });

    console.log("[Portfolio] Response received:", response);

    if (response.errorCode) {
      console.warn("[Portfolio] Supabase fetch error:", response.errorMessage);
      return [];
    }

    // ✅ FIX: Items are spread directly in response, not nested in response.data
    const items = response.items || [];
    console.log("[Portfolio] Items from Supabase:", items.length, "items");
    console.log(
      "[Portfolio] Raw Supabase items:",
      JSON.stringify(items, null, 2),
    );

    // ✅ Transform Supabase format to UI format
    // Supabase: { id, symbol, quantity, avg_price, current_price, ... }
    // UI expects: { code, entry, currentPrice, quantity, ... }
    const transformed = items.map((item) => {
      console.log(`[Portfolio] Transforming item:`, item);
      console.log(
        `[Portfolio] - symbol: ${item.symbol}, current_price: ${item.current_price}`,
      );
      return {
        id: item.id,
        code: item.symbol,
        symbol: item.symbol,
        quantity: item.quantity,
        entry: item.avg_price,
        avg_price: item.avg_price,
        currentPrice: item.current_price,
        current_price: item.current_price,
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    console.log("[Portfolio] Transformed items:", transformed);
    return transformed;
  } catch (error) {
    console.error("[Portfolio] Message error:", error);
    return [];
  }
}

/**
 * Add stock to Supabase portfolio
 */
async function addStockToSupabase(symbol, quantity, avgPrice) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_ADD,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        symbol: symbol.toUpperCase(),
        quantity: parseFloat(quantity),
        avgPrice: parseFloat(avgPrice),
      },
    });

    if (response.errorCode) {
      throw new Error(response.errorMessage || "Failed to add stock");
    }

    // 🔧 FIX: Handler returns item at top-level (spread operator), not in response.data
    return response;
  } catch (error) {
    console.error("[Portfolio] Add stock error:", error);
    throw error;
  }
}

/**
 * Update stock in Supabase portfolio
 * ✅ FIX-3: Use symbol instead of id to avoid UUID type errors
 */
async function updateStockInSupabase(id, symbol, quantity, avgPrice) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_UPDATE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        symbol: symbol.toUpperCase(), // ✅ Send symbol, not id
        updates: {
          quantity: parseFloat(quantity),
          avg_price: parseFloat(avgPrice),
        },
      },
    });

    if (response.errorCode) {
      // Handle invalid id format error
      if (response.errorMessage && response.errorMessage.includes("ID")) {
        throw new Error(
          `Lỗi định dạng: Vui lòng sử dụng mã cổ phiếu (${symbol}) để cập nhật. ${response.errorMessage}`,
        );
      }
      throw new Error(response.errorMessage || "Failed to update stock");
    }

    // 🔧 FIX: Handler returns item at top-level (spread operator), not in response.data
    return response;
  } catch (error) {
    console.error("[Portfolio] Update stock error:", error);
    throw error;
  }
}

/**
 * Remove stock from Supabase portfolio
 * ✅ FIX-3: Use symbol instead of id to avoid UUID type errors
 */
async function removeStockFromSupabase(id, symbol) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_REMOVE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { symbol: symbol || id }, // ✅ Use symbol if provided, fallback to id
    });

    if (response.errorCode) {
      // Handle invalid id format error
      if (response.errorMessage && response.errorMessage.includes("ID")) {
        throw new Error(
          `Lỗi định dạng: Vui lòng sử dụng mã cổ phiếu (${symbol}) để xóa. ${response.errorMessage}`,
        );
      }
      throw new Error(response.errorMessage || "Failed to remove stock");
    }

    // 🔧 FIX: Handler returns identifier at top-level (spread operator), not in response.data
    return response;
  } catch (error) {
    console.error("[Portfolio] Remove stock error:", error);
    throw error;
  }
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  const div = document.createElement("div");
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
  editingStockId = null,
}) {
  // Load initial portfolio and prompt first
  await loadPortfolioUI(portfolioTable);
  await loadPortfolioPrompt(promptInput);

  // Auto-start realtime updates
  try {
    await startRealtimeUpdates(portfolioTable);
    console.log(
      "[Portfolio] Realtime updates started automatically (800ms interval)",
    );
  } catch (err) {
    console.warn(
      "[Portfolio] Failed to start realtime, will use manual updates:",
      err,
    );
  }

  // Add stock button
  addStockBtn?.addEventListener("click", () =>
    openAddStockModal(portfolioTable),
  );

  // Refresh prices button
  const refreshPricesBtn = document.getElementById("refreshPricesBtn");
  refreshPricesBtn?.addEventListener("click", async () => {
    try {
      refreshPricesBtn.disabled = true;
      refreshPricesBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i>';
      await manualRefreshPrices(portfolioTable);
      refreshPricesBtn.disabled = false;
      refreshPricesBtn.innerHTML =
        '<i class="fas fa-sync-alt"></i>';
    } catch (err) {
      console.error("[Portfolio] Manual refresh failed:", err);
      refreshPricesBtn.disabled = false;
      refreshPricesBtn.innerHTML =
        '<i class="fas fa-sync-alt"></i>';
      alert("Lỗi khi làm mới giá: " + err.message);
    }
  });

  // Keep backward compatibility - remove addCashBtn listener

  // Evaluate button
  evaluateBtn?.addEventListener("click", async () => {
    const prompt = promptInput?.value.trim();
    if (!prompt) {
      alert('Vui lòng nhập prompt đánh giá trong tab "Cấu hình"');
      return;
    }

    try {
      // ✅ GPT-FIX: Prompt is now saved to Supabase via settings handler
      // (Settings page handle prompt saving, not here)

      // Disable button while processing
      evaluateBtn.disabled = true;
      evaluateBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

      // Wait for evaluate to complete and get chatId
      const result = await evaluatePortfolio(prompt);

      evaluateBtn.disabled = false;
      evaluateBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i>';

      if (!result.success) {
        console.error(
          "[Portfolio] Failed to evaluate portfolio:",
          result.error,
        );
        alert("Lỗi gửi prompt: " + (result.error || "Unknown error"));
      } else {
        console.log(
          "[Portfolio] Evaluation sent successfully, chatId:",
          result.chatId,
        );
      }
    } catch (err) {
      console.error("[Portfolio] Evaluate error:", err);
      evaluateBtn.disabled = false;
      evaluateBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i>';
      alert("Lỗi: " + err.message);
    }
  });

  // Tea stock button - sends tea stock prompt to ChatGPT
  teaStockBtn?.addEventListener("click", async () => {
    const prompt = teaStockPromptInput?.value.trim();
    if (!prompt) {
      alert('Vui lòng nhập prompt tìm cổ phiếu trà đá trong tab "Cấu hình"');
      return;
    }

    try {
      teaStockBtn.disabled = true;
      teaStockBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

      const result = await sendPromptWithHistory(
        prompt,
        "Tea Stock Search",
        true,
      );

      teaStockBtn.disabled = false;
      teaStockBtn.innerHTML = '<i class="fas fa-leaf"></i>';

      if (!result.success) {
        console.error(
          "[Portfolio] Failed to send tea stock prompt:",
          result.error,
        );
        alert("Lỗi gửi prompt: " + (result.error || "Unknown error"));
      } else {
        console.log(
          "[Portfolio] Tea stock prompt sent, chatId:",
          result.chatId,
        );
      }
    } catch (err) {
      console.error("[Portfolio] Tea stock error:", err);
      teaStockBtn.disabled = false;
      teaStockBtn.innerHTML = '<i class="fas fa-leaf"></i>';
      alert("Lỗi: " + err.message);
    }
  });

  // ✅ REMOVED: Duplicate teaStockBtn listener (kept sendPromptWithHistory version above)

  // Modal close buttons
  const portfolioModal = document.getElementById("portfolioModal");
  const closePortfolioModal = document.getElementById("closePortfolioModal");
  const cancelPortfolioBtn = document.getElementById("cancelPortfolioBtn");

  closePortfolioModal?.addEventListener("click", () => {
    portfolioModal?.classList.add("hidden");
  });

  cancelPortfolioBtn?.addEventListener("click", () => {
    portfolioModal?.classList.add("hidden");
  });

  // Price update modal handlers
  const priceUpdateModal = document.getElementById("priceUpdateModal");
  const closePriceModal = document.getElementById("closePriceModal");
  const cancelPriceBtn = document.getElementById("cancelPriceBtn");
  const savePricesBtn = document.getElementById("savePricesBtn");

  closePriceModal?.addEventListener("click", () => {
    priceUpdateModal?.classList.add("hidden");
  });

  cancelPriceBtn?.addEventListener("click", () => {
    priceUpdateModal?.classList.add("hidden");
  });

  savePricesBtn?.addEventListener("click", async () => {
    await savePriceUpdates(portfolioTable);
    priceUpdateModal?.classList.add("hidden");
  });
}

export async function loadPortfolioUI(table) {
  console.log(
    "[Portfolio] loadPortfolioUI called, table:",
    table ? "exists" : "NULL",
  );

  const portfolio = await getPortfolio();
  console.log(
    "[Portfolio] Portfolio data loaded:",
    portfolio?.length || 0,
    "items",
    portfolio,
  );

  if (!table) {
    console.warn(
      "[Portfolio] ❌ Table element is NULL! Cannot render portfolio",
    );
    return;
  }

  // Update realtime status UI
  checkRealtimeStatus();

  // Update last update time display
  updateLastUpdateTime(portfolio);

  table.innerHTML = "";
  if (portfolio.length === 0) {
    console.log("[Portfolio] Portfolio is empty");
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.style.textAlign = "center";
    cell.style.padding = "20px";
    cell.textContent = 'Chưa có mã nào. Nhấn "+ Thêm mã" để thêm.';
    return;
  }

  // Calculate portfolio P&L
  const portfolioSummary = calculatePortfolioTotalPL(portfolio);

  // Display summary
  const summaryEl = document.getElementById("portfolioSummary");
  if (summaryEl && portfolio.some((s) => s.currentPrice)) {
    summaryEl.style.display = "block";
    // Use short formatting for summary values (e.g., 200000000 -> 200M)
    document.getElementById("totalEntry").textContent = formatShortNumber(
      portfolioSummary.totalEntryValue,
    );
    document.getElementById("currentValue").textContent = formatShortNumber(
      portfolioSummary.totalCurrentValue,
    );
    const plEl = document.getElementById("totalPL");
    plEl.textContent = `${formatShortNumber(portfolioSummary.totalPL)} ${formatPercent(portfolioSummary.totalPLPercent)}`;
    plEl.className = `summary-value ${getPLClass(portfolioSummary.totalPL)}`;
  }

  // Sort: regular stocks first, CASH always at the end
  // Create a copy with index mapping to preserve original indices
  const indexedPortfolio = portfolio.map((stock, originalIdx) => ({
    stock,
    originalIdx,
  }));
  indexedPortfolio.sort((a, b) => {
    if (a.stock.code === "CASH") return 1;
    if (b.stock.code === "CASH") return -1;
    return 0;
  });

  console.log(
    "[Portfolio] Rendering",
    indexedPortfolio.length,
    "rows to table",
  );

  indexedPortfolio.forEach(({ stock, originalIdx }) => {
    console.log("[Portfolio] Rendering stock:", stock.code, stock);
    const row = document.createElement("tr");
    const isCash = stock.code === "CASH";

    if (isCash) {
      row.style.backgroundColor = "#f0f9ff";
      row.style.fontWeight = "bold";
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
        : "-";

      row.innerHTML = `
        <td>${escapeHtml(stock.code)}</td>
        <td>${stock.entry}</td>
        <td>${stock.currentPrice || "-"}</td>
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
    console.log("[Portfolio] Appending row to table:", row);
    table.appendChild(row);
  });

  console.log(
    "[Portfolio] ✓ All rows appended. Table HTML:",
    table.innerHTML.substring(0, 200),
  );

  // Add event listeners for dropdown toggle
  table.querySelectorAll(".portfolio-actions-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      // Close all other menus
      document.querySelectorAll(".portfolio-actions-menu.open").forEach((m) => {
        if (m !== menu) m.classList.remove("open");
      });
      menu.classList.toggle("open");
    });
  });

  // Add event listeners for edit action
  table.querySelectorAll(".action-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(e.target.closest("button").dataset.id);
      // Close menu
      e.target.closest(".portfolio-actions-menu").classList.remove("open");
      openEditStockModal(id, table);
    });
  });

  // Add event listeners for delete action
  table.querySelectorAll(".action-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = parseInt(e.target.closest("button").dataset.id);
      // Get stock code from the row
      const row = e.target.closest("tr");
      const code = row.querySelector("td:nth-child(1)")?.textContent?.trim();
      // Close menu
      e.target.closest(".portfolio-actions-menu").classList.remove("open");
      if (confirm("Xác nhận xóa mã này?")) {
        await deleteStock(id, code);
        await loadPortfolioUI(table);
      }
    });
  });

  // Add event listeners for evaluate action
  table.querySelectorAll(".action-evaluate").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const code = e.target.closest("button").dataset.code;
      // Close menu
      e.target.closest(".portfolio-actions-menu").classList.remove("open");
      await evaluateStock(code);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    document
      .querySelectorAll(".portfolio-actions-menu.open")
      .forEach((menu) => {
        menu.classList.remove("open");
      });
  });
}

// X51LABS-95: Extract common modal logic
function getModalElements() {
  const modal = document.getElementById("portfolioModal");
  if (!modal) return null;

  const elements = {
    modal,
    titleEl: modal.querySelector("#portfolioModalTitle"),
    codeInput: modal.querySelector("#stockCodeInput"),
    entryInput: modal.querySelector("#stockEntryInput"),
    quantityInput: modal.querySelector("#stockQuantityInput"),
    saveBtn: modal.querySelector("#saveStockBtn"),
    entryLabel: modal.querySelector('label[for="stockEntryInput"]'),
    quantityLabel: modal.querySelector('label[for="stockQuantityInput"]'),
  };

  if (
    !elements.titleEl ||
    !elements.codeInput ||
    !elements.entryInput ||
    !elements.quantityInput ||
    !elements.saveBtn
  ) {
    console.error("[Portfolio] Modal elements not found");
    return null;
  }

  return elements;
}

// X51LABS-95: Extract modal field configuration
function configureModalFields(elements, config) {
  const {
    titleEl,
    codeInput,
    entryInput,
    quantityInput,
    entryLabel,
    quantityLabel,
  } = elements;
  const {
    title,
    code = "",
    entry = "",
    quantity = "",
    isCash = false,
  } = config;

  titleEl.textContent = title;
  codeInput.value = code;
  entryInput.value = entry;
  quantityInput.value = quantity;

  if (isCash) {
    if (entryLabel) entryLabel.style.display = "none";
    if (quantityLabel) quantityLabel.textContent = "Số tiền sẵn sàng:";
    entryInput.style.display = "none";
    codeInput.disabled = true;
  } else {
    if (entryLabel) entryLabel.style.display = "";
    if (quantityLabel) quantityLabel.textContent = "Khối lượng:";
    entryInput.style.display = "";
    codeInput.disabled = false;
    codeInput.placeholder = "VNM, BID, CASH, ...";
    codeInput.style.backgroundColor = "";
  }
}

// X51LABS-95: Extract save button setup
function setupModalSaveButton(elements, onSave) {
  const { modal, saveBtn } = elements;

  // Replace button to remove old listeners
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener("click", async () => {
    await onSave();
    modal.classList.add("hidden");
  });
}

function openAddStockModal(portfolioTable) {
  const elements = getModalElements();
  if (!elements) return;

  // X51LABS-95: Use extracted helpers
  configureModalFields(elements, {
    title: "Thêm/Sửa mã (hoặc CASH)",
  });

  elements.modal.classList.remove("hidden");

  // X51LABS-95: Use extracted save handler
  setupModalSaveButton(elements, async () => {
    const { codeInput, entryInput, quantityInput } = elements;
    const code = codeInput.value.trim().toUpperCase();
    const entry = parseFloat(entryInput.value);
    const quantity = parseFloat(quantityInput.value);

    if (!code || isNaN(quantity)) {
      alert("Vui lòng nhập Mã và Khối lượng");
      return;
    }

    if (code !== "CASH" && isNaN(entry)) {
      alert("Vui lòng nhập Entry");
      return;
    }

    const portfolio = await getPortfolio();
    const existingIdx = portfolio.findIndex((s) => s.code === code);

    if (existingIdx >= 0) {
      const existing = portfolio[existingIdx];
      const newQuantity = existing.quantity + quantity;
      await updateStock(existingIdx, code, existing.entry, newQuantity);
      console.log(
        `[Portfolio] Updated ${code}: +${quantity} (Total: ${newQuantity})`,
      );
    } else {
      const finalEntry = code === "CASH" ? 1 : entry;
      await addStock(code, finalEntry, quantity);
      console.log(`[Portfolio] Added ${code}: ${quantity}`);
    }

    await loadPortfolioUI(portfolioTable);
  });
}

function openEditStockModal(id, portfolioTable) {
  getPortfolio().then((portfolio) => {
    const stock = portfolio[id];
    if (!stock) return;

    // X51LABS-95: Use extracted helpers
    const elements = getModalElements();
    if (!elements) return;

    const isCash = stock.code === "CASH";
    configureModalFields(elements, {
      title: isCash ? "Sửa CASH" : "Sửa mã chứng khoán",
      code: stock.code,
      entry: stock.entry,
      quantity: stock.quantity,
      isCash,
    });

    elements.modal.classList.remove("hidden");

    setupModalSaveButton(elements, async () => {
      const { codeInput, entryInput, quantityInput } = elements;
      const code = codeInput.value.trim();
      const quantity = parseFloat(quantityInput.value);

      if (isNaN(quantity)) {
        alert("Vui lòng điền thông tin");
        return;
      }

      if (isCash) {
        await updateStock(id, code, 1, quantity);
      } else {
        const entry = parseFloat(entryInput.value);
        if (!code || isNaN(entry)) {
          alert("Vui lòng điền đầy đủ thông tin");
          return;
        }
        await updateStock(id, code, entry, quantity);
      }

      await loadPortfolioUI(portfolioTable);
    });
  });
}

export async function getPortfolio() {
  // ✅ GPT-FIX: Use Supabase via background handler instead of chrome.storage.local
  return await getPortfolioFromSupabase();
}

export async function loadPortfolioPrompt(promptInput) {
  if (!promptInput) return;
  const stored = await chrome.storage.local.get([PORTFOLIO_PROMPT_KEY]);
  promptInput.value = stored[PORTFOLIO_PROMPT_KEY] || "";
}

export async function addStock(code, entry, quantity) {
  // ✅ GPT-FIX: Use Supabase via background handler
  await addStockToSupabase(code, quantity, entry);
  console.log("[Portfolio] Stock added to Supabase:", code);
}

export async function updateStock(id, code, entry, quantity) {
  // ✅ GPT-FIX: Use Supabase via background handler
  await updateStockInSupabase(id, code, quantity, entry);
  console.log("[Portfolio] Stock updated in Supabase:", code);
}

export async function deleteStock(id, symbol) {
  // ✅ GPT-FIX: Use Supabase via background handler
  // ✅ FIX-3: Pass symbol instead of id
  await removeStockFromSupabase(id, symbol);
  console.log("[Portfolio] Stock removed from Supabase");
}

export async function evaluatePortfolio(prompt) {
  const portfolio = await getPortfolio();

  // Build portfolio string (same as before)
  let portfolioText = "## DANH MỤC HIỆN CÓ\n\n";
  portfolioText += "| Mã | Entry | Current | Khối lượng | P&L |\n";
  portfolioText += "|----|-------|---------|-----------|-----|\n";

  let totalEntry = 0;
  let totalCurrent = 0;
  portfolio.forEach((stock) => {
    const entryValue = stock.entry * stock.quantity;
    const currentValue = (stock.currentPrice || stock.entry) * stock.quantity;
    const pl = currentValue - entryValue;
    const plPercent = entryValue > 0 ? ((pl / entryValue) * 100).toFixed(2) : 0;

    totalEntry += entryValue;
    totalCurrent += currentValue;

    portfolioText += `| ${stock.code} | ${stock.entry} | ${stock.currentPrice || "-"} | ${stock.quantity} | ${pl.toFixed(2)} (${plPercent}%) |\n`;
  });

  const totalPL = totalCurrent - totalEntry;
  const totalPLPercent =
    totalEntry > 0 ? ((totalPL / totalEntry) * 100).toFixed(2) : 0;
  portfolioText += `\n**Tổng P&L: ${totalPL.toFixed(2)} (${totalPLPercent}%)**\n\n`;

  // Combine with prompt
  const fullPrompt = `${portfolioText}\n## YÊU CẦU\n${prompt}`;

  console.log(
    "[Portfolio] Evaluate request (using SEND_PROMPT flow):",
    fullPrompt,
  );

  try {
    // Send prompt to background (same as runBtn)
    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt: fullPrompt,
        options: {
          createNewChat: true,
          focusTab: true,
        },
      },
    };

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (resp) => resolve(resp));
    });

    if (chrome.runtime.lastError) {
      console.error(
        "[Portfolio] Send error:",
        chrome.runtime.lastError.message,
      );
      return { success: false, error: chrome.runtime.lastError.message };
    }

    if (!response || response.type === MESSAGE_TYPES.ERROR) {
      const errorMsg = response?.errorMessage || "Unknown error";
      console.error("[Portfolio] Failed to send prompt:", errorMsg);
      return { success: false, error: errorMsg };
    }

    // Extract chatId/chatUrl
    let chatIdToSave = response.chatId || null;
    let chatUrlToSave = response.chatUrl || null;

    if (!chatIdToSave && chatUrlToSave) {
      chatIdToSave = extractChatIdFromUrl(chatUrlToSave);
    }

    // If still no chatId, attempt lightweight polling to get chatUrl via CHATGPT_GET_OUTPUT
    if (!chatIdToSave) {
      for (let i = 0; i < 10 && !chatIdToSave; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const pollMsg = {
          v: 1,
          type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          payload: { wait: false },
        };
        const pollResp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(pollMsg, (resp) => resolve(resp));
        });
        if (pollResp?.chatUrl) {
          chatUrlToSave = pollResp.chatUrl;
          chatIdToSave = pollResp.chatId || extractChatIdFromUrl(chatUrlToSave);
          break;
        }
      }
    }

    // If we have a chatUrl/chatId, save to Supabase history via background
    if (chatUrlToSave || chatIdToSave) {
      const historyData = {
        chat_id: chatIdToSave || null,
        chat_url: chatUrlToSave || null,
        prompt: fullPrompt,
        response: "[Đang chờ ChatGPT trả lời...]",
        timestamp: Date.now(),
      };

      const historyResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            v: 1,
            type: MESSAGE_TYPES.HISTORY_ADD,
            correlationId: generateCorrelationId(),
            timestamp: Date.now(),
            data: historyData,
          },
          (resp) => resolve(resp),
        );
      });

      const historyId = historyResp?.history?.id || null;

      // Start polling for response
      const maxPolls = 60; // 2 minutes (60 * 2s)
      let pollCount = 0;

      const intervalId = setInterval(async () => {
        pollCount++;
        if (pollCount >= maxPolls) {
          clearInterval(intervalId);
          console.warn("[Portfolio] Max polls reached, stopping");
          return;
        }

        try {
          const outMsg = {
            v: 1,
            type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
            correlationId: generateCorrelationId(),
            timestamp: Date.now(),
            payload: {
              chatId: chatIdToSave,
              options: { wait: true, timeoutMs: 5000, stableMs: 2000 },
            },
          };

          const outResp = await new Promise((resolve) => {
            chrome.runtime.sendMessage(outMsg, (resp) => resolve(resp));
          });

          if (outResp && outResp.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY) {
            const responseText = outResp.response || outResp.output || "";
            if (
              responseText &&
              responseText.length > 10 &&
              responseText !== "[Đang chờ ChatGPT trả lời...]"
            ) {
              // Save to Supabase via HISTORY_UPDATE
              const updateData = {
                response: responseText,
                chat_url: outResp.chatUrl || chatUrlToSave,
              };
              if (historyId) updateData.id = historyId;
              else updateData.chat_id = chatIdToSave;

              const updateResp = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                  {
                    v: 1,
                    type: MESSAGE_TYPES.HISTORY_UPDATE,
                    correlationId: generateCorrelationId(),
                    timestamp: Date.now(),
                    data: updateData,
                  },
                  (resp) => resolve(resp),
                );
              });

              console.log("[Portfolio] HISTORY_UPDATE response:", updateResp);

              // ✅ Auto-reload history in Results tab (if results module is set)
              if (resultsModule && resultsModule.loadAndDisplayHistory) {
                try {
                  await resultsModule.loadAndDisplayHistory();
                  console.log(
                    "[Portfolio] Results history reloaded after HISTORY_UPDATE",
                  );
                } catch (err) {
                  console.warn(
                    "[Portfolio] Failed to reload results history:",
                    err,
                  );
                }
              }

              clearInterval(intervalId);
            }
          }
        } catch (err) {
          console.error("[Portfolio] Polling error:", err);
        }
      }, 2000);
    } else {
      console.warn(
        "[Portfolio] Could not obtain chatId/chatUrl to save history",
      );
    }

    return { success: true, chatId: chatIdToSave, chatUrl: chatUrlToSave };
  } catch (err) {
    console.error("[Portfolio] evaluatePortfolio error:", err);
    return { success: false, error: err.message };
  }
}

// Price update functions
async function openPriceUpdateModal(portfolioTable) {
  const portfolio = await getPortfolio();
  const priceUpdateList = document.getElementById("priceUpdateList");

  if (!priceUpdateList) return;

  // Filter out CASH
  const stocks = portfolio.filter((s) => s.code !== "CASH");

  priceUpdateList.innerHTML = stocks
    .map(
      (stock) => `
    <div class="price-update-item">
      <label>${escapeHtml(stock.code)}</label>
      <input type="number" class="price-input" data-code="${escapeHtml(stock.code)}" 
             value="${stock.currentPrice || stock.entry}" 
             step="0.1" min="0" placeholder="Current price" />
      <span style="font-size: 11px; color: #666;">(Entry: ${stock.entry})</span>
    </div>
  `,
    )
    .join("");

  const priceUpdateModal = document.getElementById("priceUpdateModal");
  priceUpdateModal?.classList.remove("hidden");
}

async function savePriceUpdates(portfolioTable) {
  const portfolio = await getPortfolio();
  const priceInputs = document.querySelectorAll(".price-input");

  let updated = false;
  priceInputs.forEach((input) => {
    const code = input.dataset.code;
    const price = parseFloat(input.value);

    if (price > 0) {
      const stock = portfolio.find((s) => s.code === code);
      if (stock) {
        stock.currentPrice = price;
        stock.priceUpdatedAt = new Date().toISOString();
        updated = true;
      }
    }
  });

  if (updated) {
    // ✅ GPT-FIX: Price updates are now handled by Supabase
    // Don't save to local storage anymore
    // await chrome.storage.local.set({ [PORTFOLIO_KEY]: portfolio });
    await loadPortfolioUI(portfolioTable);
    console.log("[Portfolio] Prices updated");
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
        return (
          manifest.version_name?.includes("dev") ||
          manifest.version_name?.includes("debug") ||
          false
        );
      } catch (e) {
        return false; // Production default
      }
    })();

    realtimeClient = new AdvancedMarketDataClient({
      realtimeEnabled: true,
      pollInterval: 60000, // Poll every 60 seconds
      minUpdateInterval: 60000, // Update callback every 60 seconds
      debug: isDebugMode, // X51LABS-68: Auto-detect debug mode
    });

    console.log(
      "[Portfolio] Realtime client initialized (60s updates), debug:",
      isDebugMode,
    );
  }
  return realtimeClient;
}

async function startRealtimeUpdates(portfolioTable) {
  try {
    if (!realtimeClient) {
      realtimeClient = initRealtimeClient();
    }

    // Verify client is properly initialized
    if (!realtimeClient || typeof realtimeClient.subscribe !== "function") {
      throw new Error("Realtime client failed to initialize");
    }

    const portfolio = await getPortfolio();
    const stocks = portfolio.filter((s) => s.code !== "CASH");

    if (stocks.length === 0) {
      console.log("[Portfolio] No stocks to subscribe");
      return;
    }

    // Unsubscribe old ones
    currentSubscriptions.forEach((unsubscribe, symbol) => {
      try {
        console.log(`[Portfolio] Unsubscribing ${symbol}`);
        unsubscribe(); // Call the unsubscribe function
      } catch (e) {
        console.warn("[Portfolio] Failed to unsubscribe:", symbol, e);
      }
    });
    currentSubscriptions.clear();

    // Subscribe to all stocks
    stocks.forEach((stock) => {
      const symbol = stock.code;
      try {
        console.log(`[Portfolio] Subscribing to ${symbol}`);
        const unsubscribe = realtimeClient.subscribe(symbol, async (data) => {
          try {
            console.log(`[Portfolio] Price update: ${symbol} = ${data.price}`);

            // Get current portfolio to find stock ID
            const portfolio = await getPortfolio();
            const stockInPortfolio = portfolio.find((s) => s.code === symbol);

            if (stockInPortfolio) {
              // Update price in memory
              stockInPortfolio.currentPrice = data.price;
              stockInPortfolio.priceUpdatedAt = new Date().toISOString();

              // ✅ Save to Supabase via PORTFOLIO_UPDATE handler
              // ✅ FIX-3: Use symbol instead of id
              await chrome.runtime
                .sendMessage({
                  v: 1,
                  type: MESSAGE_TYPES.PORTFOLIO_UPDATE,
                  correlationId: generateCorrelationId(),
                  timestamp: Date.now(),
                  data: {
                    symbol: symbol, // ✅ Use symbol, not id
                    updates: {
                      current_price: data.price,
                    },
                  },
                })
                .catch((err) => {
                  console.warn(
                    `[Portfolio] Failed to save ${symbol} price to Supabase:`,
                    err,
                  );
                });

              // Update UI if table exists
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

    console.log(
      `[Portfolio] Subscribed to ${stocks.length} stocks (realtime 800ms)`,
    );

    // Update status
    checkRealtimeStatus();
  } catch (err) {
    console.error("[Portfolio] startRealtimeUpdates failed:", err);
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
    console.log("[Portfolio] Stopped realtime updates");

    // Update status
    checkRealtimeStatus();
  }
}

/**
 * Evaluate a stock by sending evaluation request to ChatGPT
 */
async function evaluateStock(stockCode) {
  try {
    const settings = await chrome.storage.local.get("stockEvalPrompt");
    let evalPrompt =
      settings.stockEvalPrompt ||
      "Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.";

    const prompt = evalPrompt.replace("{SYMBOL}", stockCode);

    // Get current portfolio for context
    const portfolio = await getPortfolio();
    const stock = portfolio.find((s) => s.code === stockCode);

    let fullPrompt = prompt;
    if (stock) {
      const pl = stock.currentPrice
        ? (((stock.currentPrice - stock.entry) / stock.entry) * 100).toFixed(2)
        : "N/A";
      const context = `\n\n**Thông tin hiện tại:**\n- Mã: ${stock.code}\n- Entry: ${stock.entry}\n- Giá hiện tại: ${stock.currentPrice || "N/A"}\n- Khối lượng: ${stock.quantity}\n- P&L: ${pl}%`;
      fullPrompt = `${prompt}${context}`;
    }

    console.log("[Portfolio] Sending stock evaluation:", {
      stockCode,
      prompt: fullPrompt,
    });

    // Send with history tracking
    const result = await sendPromptWithHistory(
      fullPrompt,
      `Stock Evaluation: ${stockCode}`,
      true,
    );

    if (!result.success) {
      alert("Không thể gửi đánh giá: " + (result.error || "Unknown error"));
    } else {
      console.log("[Portfolio] Stock evaluation sent, chatId:", result.chatId);
    }
  } catch (err) {
    console.error("[Portfolio] Error evaluating stock:", err);
    alert("Lỗi khi đánh giá mã: " + err.message);
  }
}

function updateRealtimeStatus(connected) {
  const statusEl = document.getElementById("realtimeStatus");
  if (statusEl) {
    statusEl.textContent = connected ? "🟢 Realtime (800ms)" : "🔴 Offline";
    statusEl.style.color = connected ? "#4caf50" : "#999";
  }
}

// Check and update status based on subscriptions
function checkRealtimeStatus() {
  const isActive = currentSubscriptions.size > 0;
  updateRealtimeStatus(isActive);

  const updatePricesBtn = document.getElementById("updatePricesBtn");
  if (updatePricesBtn) {
    if (isActive) {
      updatePricesBtn.textContent = "⏸️ Tắt Realtime";
      updatePricesBtn.style.backgroundColor = "#4caf50";
    } else {
      updatePricesBtn.textContent = "▶️ Bật Realtime";
      updatePricesBtn.style.backgroundColor = "#666";
    }
  }
}

/**
 * Send prompt to ChatGPT and save to history
 * @param {string} prompt - The prompt to send
 * @param {string} title - Short title for history entry
 * @param {boolean} createNewChat - Whether to create new chat
 * @returns {Promise<{success: boolean, chatId?: string, chatUrl?: string, error?: string}>}
 */
async function sendPromptWithHistory(prompt, title, createNewChat = true) {
  try {
    // Create history entry immediately with pending status
    const timestamp = Date.now();
    const historyEntry = {
      prompt: prompt,
      title: title,
      response: "[Đang chờ ChatGPT trả lời...]",
      timestamp: timestamp,
      chatUrl: "",
      chatId: "",
      source: "portfolio",
      pending: true,
    };

    // Save to history
    await saveChatToHistory(historyEntry);
    console.log("[Portfolio] Saved pending chat to history");

    // Send prompt to ChatGPT
    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: timestamp,
      payload: {
        prompt: prompt,
        options: {
          createNewChat: createNewChat,
          focusTab: true,
        },
      },
    };

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });

    if (chrome.runtime.lastError) {
      console.error(
        "[Portfolio] Send error:",
        chrome.runtime.lastError.message,
      );
      // Update history with error
      historyEntry.pending = false;
      historyEntry.response = `[Lỗi: ${chrome.runtime.lastError.message}]`;
      await saveChatToHistory(historyEntry);
      return { success: false, error: chrome.runtime.lastError.message };
    }

    if (!response || response.type === MESSAGE_TYPES.ERROR) {
      const errorMsg =
        response?.payload?.error || response?.error || "Unknown error";
      console.error("[Portfolio] Failed to send prompt:", errorMsg);
      // Update history with error
      historyEntry.pending = false;
      historyEntry.response = `[Lỗi: ${errorMsg}]`;
      await saveChatToHistory(historyEntry);
      return { success: false, error: errorMsg };
    }

    console.log("[Portfolio] Prompt sent successfully to ChatGPT");

    // Get chatId/chatUrl from response - createResponse spreads payload directly at top-level
    // NOT nested: response.payload.chatId doesn't exist!
    let finalChatId = response.chatId || null;
    let finalChatUrl = response.chatUrl || null;

    console.log(
      "[Portfolio] Initial response chatId:",
      finalChatId,
      "chatUrl:",
      finalChatUrl,
    );

    // Extract chatId from URL if we have URL but no ID
    if (!finalChatId && finalChatUrl) {
      finalChatId = extractChatIdFromUrl(finalChatUrl);
      console.log("[Portfolio] Extracted chatId from URL:", finalChatId);
    }

    // If still no URL, try polling for it (in case chat was just created)
    if (!finalChatUrl && !response.reviewMode) {
      console.log("[Portfolio] ChatUrl not available, polling for it...");

      // Poll up to 20 times with 500ms interval = 10 seconds
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Get chatUrl from CHATGPT_GET_OUTPUT which queries the content script directly
        const pollMessage = {
          v: 1,
          type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          chatId: finalChatId, // Pass chatId for tracking
          payload: { wait: false },
        };

        const pollResponse = await new Promise((resolve) => {
          chrome.runtime.sendMessage(pollMessage, (response) => {
            resolve(response);
          });
        });

        if (pollResponse?.chatUrl) {
          finalChatUrl = pollResponse.chatUrl;
          finalChatId =
            pollResponse.chatId || extractChatIdFromUrl(finalChatUrl);
          console.log(
            "[Portfolio] Got chatUrl from poll attempt",
            i + 1,
            ":",
            finalChatUrl,
          );
          break;
        }
      }
    }

    // Build URL from chatId if we only have ID
    if (finalChatId && !finalChatUrl) {
      finalChatUrl = `https://chatgpt.com/c/${finalChatId}`;
    }

    // Update history entry with chatId/chatUrl
    if (finalChatId || finalChatUrl) {
      historyEntry.chatId = finalChatId || "";
      historyEntry.chatUrl = finalChatUrl || "";
      await saveChatToHistory(historyEntry);
      console.log(
        "[Portfolio] Updated history with chatId:",
        historyEntry.chatId,
        "chatUrl:",
        historyEntry.chatUrl,
      );
    } else {
      console.warn("[Portfolio] No chatId or chatUrl found after polling");
    }

    // Start polling for response in background (don't wait)
    if (!response.reviewMode) {
      pollForResponse(historyEntry.timestamp, prompt).catch((err) => {
        console.error("[Portfolio] Background polling error:", err);
      });
    }

    return {
      success: true,
      chatId: finalChatId,
      chatUrl: finalChatUrl,
    };
  } catch (err) {
    console.error("[Portfolio] sendPromptWithHistory error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Poll for ChatGPT response and update history entry
 * @param {number} timestamp - Timestamp of the history entry to update
 * @param {string} originalPrompt - Original prompt sent
 */
async function pollForResponse(timestamp, originalPrompt) {
  console.log(
    "[Portfolio] Starting response polling for timestamp:",
    timestamp,
  );
  let pollCount = 0;
  const maxPolls = 120; // 10 minutes max (120 x 5s)

  const pollInterval = setInterval(async () => {
    pollCount++;

    if (pollCount > maxPolls) {
      console.log("[Portfolio] Max poll attempts reached, stopping");
      clearInterval(pollInterval);
      return;
    }

    try {
      // Poll for output using CHATGPT_GET_OUTPUT
      const pollMessage = {
        v: 1,
        type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        chatId: timestamp, // Use timestamp as tracking ID since it uniquely identifies this prompt
        payload: {
          wait: false,
        },
      };

      const pollResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(pollMessage, (response) => {
          resolve(response);
        });
      });

      if (chrome.runtime.lastError) {
        console.error("[Portfolio] Poll error:", chrome.runtime.lastError);
        return;
      }

      // Check if we got the result
      if (
        pollResponse?.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY &&
        pollResponse.payload
      ) {
        const { output, chatUrl, chatId } = pollResponse.payload;

        if (output) {
          console.log("[Portfolio] Got response! Length:", output.length);
          clearInterval(pollInterval);

          // Update history entry with actual response
          const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
          const history = Array.isArray(stored[CHAT_HISTORY_KEY])
            ? stored[CHAT_HISTORY_KEY]
            : [];
          const entryIndex = history.findIndex(
            (h) => h.timestamp === timestamp && h.prompt === originalPrompt,
          );

          if (entryIndex >= 0) {
            const normalized = normalizeChatMeta(chatId, chatUrl);
            history[entryIndex].response = output;
            history[entryIndex].pending = false;
            if (normalized.chatId)
              history[entryIndex].chatId = normalized.chatId;
            if (normalized.chatUrl)
              history[entryIndex].chatUrl = normalized.chatUrl;

            await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: history });
            console.log(
              "[Portfolio] History entry updated with response, chatId:",
              normalized.chatId,
            );
          } else {
            console.warn(
              "[Portfolio] History entry not found for timestamp:",
              timestamp,
            );
          }
        }
      } else if (pollResponse?.type === MESSAGE_TYPES.ERROR) {
        console.error("[Portfolio] Error getting output:", pollResponse.error);
        clearInterval(pollInterval);
      }
    } catch (err) {
      console.error("[Portfolio] Polling iteration error:", err);
    }
  }, 5000); // Poll every 5 seconds
}

/**
 * Save chat entry to history storage
 * @param {Object} entry - Chat entry to save
 */
async function saveChatToHistory(entry) {
  try {
    // Normalize chatId/chatUrl before saving
    const normalized = normalizeChatMeta(entry.chatId, entry.chatUrl);
    const normalizedEntry = {
      ...entry,
      chatId: normalized.chatId,
      chatUrl: normalized.chatUrl,
    };

    console.log("[Portfolio] Saving to history:", {
      title: normalizedEntry.title,
      timestamp: normalizedEntry.timestamp,
      chatId: normalizedEntry.chatId,
      chatUrl: normalizedEntry.chatUrl,
      source: normalizedEntry.source,
      pending: normalizedEntry.pending,
      promptLength: normalizedEntry.prompt?.length,
      responseLength: normalizedEntry.response?.length,
    });

    const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
    const history = Array.isArray(stored[CHAT_HISTORY_KEY])
      ? stored[CHAT_HISTORY_KEY]
      : [];

    // Check if entry already exists (by timestamp)
    const existingIndex = history.findIndex(
      (h) => h.timestamp === normalizedEntry.timestamp,
    );

    if (existingIndex >= 0) {
      // Update existing entry
      history[existingIndex] = normalizedEntry;
      console.log(
        "[Portfolio] Updated existing history entry at index:",
        existingIndex,
        "chatId:",
        normalizedEntry.chatId,
      );
    } else {
      // Add new entry at the beginning
      history.unshift(normalizedEntry);
      console.log(
        "[Portfolio] Added new history entry, chatId:",
        normalizedEntry.chatId,
      );
    }

    // Keep only last MAX_CHAT_HISTORY entries
    if (history.length > MAX_CHAT_HISTORY) {
      history.length = MAX_CHAT_HISTORY;
    }

    await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: history });
    console.log(
      "[Portfolio] Chat history saved successfully, total entries:",
      history.length,
    );

    // Verify what was saved
    const verified = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
    const lastEntry = verified[CHAT_HISTORY_KEY]?.[0];
    console.log("[Portfolio] Verification - Last entry in storage:", {
      chatId: lastEntry?.chatId,
      chatUrl: lastEntry?.chatUrl,
      timestamp: lastEntry?.timestamp,
    });
  } catch (err) {
    console.error("[Portfolio] Failed to save to history:", err);
  }
}

/**
 * Extract chatId from ChatGPT URL
 * @param {string} url - ChatGPT URL
 * @returns {string|null} - Extracted chatId or null
 */
function extractChatIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/(?:c|g)\/([^\/\?#]+)/);
  return match ? match[1] : null;
}

/**
 * Normalize chatId and chatUrl to ensure consistency
 * @param {string} chatId - Chat ID
 * @param {string} chatUrl - Chat URL
 * @returns {{chatId: string, chatUrl: string}}
 */
function normalizeChatMeta(chatId, chatUrl) {
  let id = typeof chatId === "string" ? chatId.trim() : "";
  let url = typeof chatUrl === "string" ? chatUrl.trim() : "";

  // If chatId looks like a URL, extract the ID from it
  if (id && (id.startsWith("http://") || id.startsWith("https://"))) {
    url = id;
    id = extractChatIdFromUrl(url) || "";
  }

  // Remove conversation_ prefix if present
  if (id.startsWith("conversation_")) {
    id = "";
  }

  // Extract ID from URL if we don't have an ID
  if (!id && url) {
    id = extractChatIdFromUrl(url) || "";
  }

  // Build URL from ID if we don't have a URL
  if (!url && id) {
    url = `https://chatgpt.com/c/${id}`;
  }

  return { chatId: id, chatUrl: url };
}

/**
 * Manual refresh prices for all stocks in portfolio
 */
async function manualRefreshPrices(portfolioTable) {
  try {
    // Ensure realtime client is initialized
    if (!realtimeClient) {
      realtimeClient = initRealtimeClient();
    }

    if (!realtimeClient || typeof realtimeClient.getStockInfo !== "function") {
      throw new Error("Realtime client not properly initialized");
    }

    const portfolio = await getPortfolio();
    const stocks = portfolio.filter((s) => s.code !== "CASH");

    if (stocks.length === 0) {
      console.log("[Portfolio] No stocks to refresh");
      return;
    }

    console.log(`[Portfolio] Manual refresh for ${stocks.length} stocks`);

    // ✅ Fetch prices from SSI API via realtime client
    const pricePromises = stocks.map((stock) =>
      realtimeClient
        .getStockInfo(stock.code)
        .then((data) => {
          console.log(`[Portfolio] SSI response for ${stock.code}:`, data);
          return { code: stock.code, data };
        })
        .catch((err) => {
          console.error(`[Portfolio] SSI fetch failed for ${stock.code}:`, err);
          return { code: stock.code, error: err };
        }),
    );

    const results = await Promise.all(pricePromises);
    console.log("[Portfolio] All SSI fetch results:", results);

    // Update portfolio with new prices and save to Supabase
    let updated = 0;
    const updatePromises = [];

    results.forEach((result) => {
      if (result.data && result.data.price) {
        const stock = portfolio.find((s) => s.code === result.code);
        if (stock) {
          console.log(
            `[Portfolio] Updating ${result.code}: price=${result.data.price}`,
          );

          stock.currentPrice = result.data.price;
          stock.priceUpdatedAt = new Date().toISOString();

          // ✅ Save to Supabase via PORTFOLIO_UPDATE handler
          // ✅ FIX-3: Use symbol instead of id
          const updatePromise = chrome.runtime
            .sendMessage({
              v: 1,
              type: MESSAGE_TYPES.PORTFOLIO_UPDATE,
              correlationId: generateCorrelationId(),
              timestamp: Date.now(),
              data: {
                symbol: result.code, // ✅ Use symbol, not id
                updates: {
                  current_price: result.data.price,
                },
              },
            })
            .then((response) => {
              console.log(
                `[Portfolio] Supabase update response for ${result.code}:`,
                response,
              );
              return response;
            })
            .catch((err) => {
              console.warn(
                `[Portfolio] Failed to update ${stock.code} in Supabase:`,
                err,
              );
            });

          updatePromises.push(updatePromise);
          updated++;
        } else {
          console.warn(
            `[Portfolio] Stock ${result.code} not found in portfolio:`,
            stock,
          );
        }
      } else if (result.error) {
        console.warn(
          `[Portfolio] Failed to fetch ${result.code}:`,
          result.error.message,
        );
      } else {
        console.warn(
          `[Portfolio] No price data for ${result.code}:`,
          result.data,
        );
      }
    });

    if (updated > 0) {
      // Wait for all Supabase updates to complete
      await Promise.allSettled(updatePromises);

      // Reload UI from Supabase to show updated prices
      await loadPortfolioUI(portfolioTable);
      console.log(
        `[Portfolio] Updated ${updated}/${stocks.length} stock prices in Supabase`,
      );
    } else {
      console.log("[Portfolio] No prices updated");
      alert("Không lấy được giá mới. Vui lòng thử lại.");
    }
  } catch (err) {
    console.error("[Portfolio] manualRefreshPrices error:", err);
    throw err;
  }
}

/**
 * Update last update time display
 */
function updateLastUpdateTime(portfolio) {
  const lastUpdateEl = document.getElementById("lastUpdateTime");
  if (!lastUpdateEl) return;

  // Find the most recent price update
  let latestUpdate = null;
  portfolio.forEach((stock) => {
    if (stock.priceUpdatedAt) {
      const updateTime = new Date(stock.priceUpdatedAt).getTime();
      if (!latestUpdate || updateTime > latestUpdate) {
        latestUpdate = updateTime;
      }
    }
  });

  if (latestUpdate) {
    const now = Date.now();
    const diff = now - latestUpdate;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let timeStr;
    if (days > 0) {
      timeStr = `${days} ngày trước`;
    } else if (hours > 0) {
      timeStr = `${hours} giờ trước`;
    } else if (minutes > 0) {
      timeStr = `${minutes} phút trước`;
    } else {
      timeStr = "Vừa xong";
    }

    lastUpdateEl.textContent = `Cập nhật: ${timeStr}`;
    lastUpdateEl.style.color =
      minutes < 5 ? "#4caf50" : minutes < 30 ? "#ff9800" : "#999";
  } else {
    lastUpdateEl.textContent = "Chưa có dữ liệu";
    lastUpdateEl.style.color = "#aaa";
  }
}

/**
 * ✅ Refresh portfolio UI - fetch latest data from Supabase and render
 * Can be called from navigation, login, or manual refresh
 */
export async function refreshPortfolioUI() {
  try {
    const portfolioTable = document.getElementById("portfolioTable");
    if (!portfolioTable) {
      console.warn("[Portfolio] ❌ Portfolio table element not found");
      return;
    }

    // Get tbody element (loadPortfolioUI expects tbody, not the table)
    const tbody = portfolioTable.querySelector("tbody");
    if (!tbody) {
      console.warn("[Portfolio] ❌ Portfolio tbody element not found");
      return;
    }

    console.log("[Portfolio] Refreshing portfolio data...");
    await loadPortfolioUI(tbody);
    console.log("[Portfolio] ✓ Portfolio data refreshed successfully");
  } catch (error) {
    console.error("[Portfolio] Failed to refresh portfolio:", error);
  }
}

/**
 * ✅ Auto-refresh portfolio on login
 * Called when user logs in to fetch latest portfolio data from Supabase
 */
export async function refreshPortfolioOnLogin() {
  console.log("[Portfolio] Refreshing portfolio on login...");
  await refreshPortfolioUI();
}
