/**
 * PortfolioActions Component
 * 
 * Action button bar with 5 buttons (matching legacy version):
 * - Refresh: Updates all stock prices via SSI API
 * - Add Stock: Opens StockModal in Add mode
 * - Evaluate: Sends portfolio summary to ChatGPT
 * - Run Prompt: Runs saved portfolio prompt immediately
 * - Tea Stock: Searches for stocks via ChatGPT
 * 
 * Each button has loading state and disabled state management.
 * 
 * @component
 * @param {Object} props
 * @param {Function} props.onAddStock - Callback when "Add Stock" clicked
 * @param {Function} props.onRefresh - Callback when "Refresh" clicked
 * @param {Function} props.onEvaluate - Callback when "Evaluate" clicked
 * @param {Function} props.onRunPrompt - Callback when "Run Prompt" clicked
 * @param {Function} props.onTeaStock - Callback when "Tea Stock" clicked
 * @param {boolean} props.isRefreshing - Whether refresh is in progress
 * @param {boolean} props.isRunningPrompt - Whether prompt is being sent
 * @param {boolean} props.anyModalOpen - Whether any modal is open
 * @returns {preact.VNode}
 */
export default function PortfolioActions({
  onAddStock,
  onRefresh,
  onEvaluate,
  onRunPrompt,
  onTeaStock,
  isRefreshing = false,
  isRunningPrompt = false,
  anyModalOpen = false,
}) {
  const isDisabled = anyModalOpen;

  return (
    <div class="portfolio-actions">
      {/* Refresh Prices - matches legacy refreshPricesBtn */}
      <button
        class="action-button action-button--secondary"
        onClick={onRefresh}
        disabled={isDisabled || isRefreshing}
        title="Làm mới giá thủ công"
      >
        {isRefreshing ? (
          <>
            <i class="fas fa-spinner fa-spin button-icon"></i>
          </>
        ) : (
          <>
            <i class="fas fa-sync-alt button-icon"></i>
          </>
        )}
      </button>

      {/* Add Stock - matches legacy addStockBtn */}
      <button
        class="action-button action-button--primary"
        onClick={onAddStock}
        disabled={isDisabled}
        title="Thêm hoặc sửa mã"
      >
        <i class="fas fa-plus button-icon"></i>
      </button>

      {/* Evaluate Portfolio - matches legacy evaluateBtn */}
      <button
        class="action-button action-button--info"
        onClick={onEvaluate}
        disabled={isDisabled}
        title="Đánh giá danh mục"
      >
        <i class="fas fa-magnifying-glass button-icon"></i>
      </button>

      {/* Run Prompt - matches legacy runBtn */}
      <button
        class="action-button action-button--success"
        onClick={onRunPrompt}
        disabled={isDisabled || isRunningPrompt}
        title="Chạy prompt ngay"
      >
        {isRunningPrompt ? (
          <>
            <i class="fas fa-spinner fa-spin button-icon"></i>
          </>
        ) : (
          <>
            <i class="fas fa-play button-icon"></i>
          </>
        )}
      </button>

      {/* Tea Stock - matches legacy teaStockBtn */}
      <button
        class="action-button action-button--accent"
        onClick={onTeaStock}
        disabled={isDisabled}
        title="Tìm cổ phiếu trà đá"
      >
        <i class="fas fa-leaf button-icon"></i>
      </button>
    </div>
  );
}
