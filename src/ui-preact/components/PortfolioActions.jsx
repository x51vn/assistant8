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
        <i class="fas fa-plus button-icon"></i>
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
            <i class="fas fa-spinner fa-spin button-icon"></i>
            Updating...
          </>
        ) : (
          <>
            <i class="fas fa-sync-alt button-icon"></i>
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
        <i class="fas fa-chart-bar button-icon"></i>
        Evaluate
      </button>

      <button
        class="action-button action-button--accent"
        onClick={onTeaStock}
        disabled={isDisabled}
        title="Search for interesting stocks using AI"
      >
        <i class="fas fa-search button-icon"></i>
        Tea Stock
      </button>
    </div>
  );
}
