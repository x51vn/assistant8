/**
 * PortfolioActions Component
 * 
 * Action button bar with 4 buttons:
 * - Add Stock: Opens StockModal in Add mode
 * - Refresh: Updates all stock prices via SSI API
 * - Evaluate: Sends portfolio summary to ChatGPT (Task 6)
 * - Tea Stock: Searches for stocks via ChatGPT (Task 6)
 * 
 * Each button has loading state and disabled state management.
 * 
 * @component
 * @param {Object} props
 * @param {Function} props.onAddStock - Callback when "Add Stock" clicked
 * @param {Function} props.onRefresh - Callback when "Refresh" clicked
 * @param {Function} props.onEvaluate - Callback when "Evaluate" clicked
 * @param {Function} props.onTeaStock - Callback when "Tea Stock" clicked
 * @param {boolean} props.isRefreshing - Whether refresh is in progress
 * @param {boolean} props.anyModalOpen - Whether any modal is open
 * @returns {preact.VNode}
 */
export default function PortfolioActions({
  onAddStock,
  onRefresh,
  onEvaluate,
  onTeaStock,
  isRefreshing = false,
  anyModalOpen = false,
}) {
  const isDisabled = anyModalOpen;

  return (
    <div class="portfolio-actions">
      <button
        class="action-button action-button--primary"
        onClick={onAddStock}
        disabled={isDisabled}
        title="Add a new stock to your portfolio"
      >
        <span class="button-icon">➕</span>
        Add Stock
      </button>

      <button
        class="action-button action-button--secondary"
        onClick={onRefresh}
        disabled={isDisabled || isRefreshing}
        title="Refresh stock prices from SSI API"
      >
        {isRefreshing ? (
          <>
            <span class="button-icon spinner"></span>
            Updating...
          </>
        ) : (
          <>
            <span class="button-icon">🔄</span>
            Refresh
          </>
        )}
      </button>

      <button
        class="action-button action-button--info"
        onClick={onEvaluate}
        disabled={isDisabled}
        title="Get ChatGPT analysis of your portfolio"
      >
        <span class="button-icon">📊</span>
        Evaluate
      </button>

      <button
        class="action-button action-button--accent"
        onClick={onTeaStock}
        disabled={isDisabled}
        title="Search for interesting stocks using AI"
      >
        <span class="button-icon">🔍</span>
        Tea Stock
      </button>
    </div>
  );
}
