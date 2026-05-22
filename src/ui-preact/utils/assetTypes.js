/**
 * Shared asset type configuration — colors, labels, icons.
 * Used by NetWorthSummary, DashboardPage, and any component
 * rendering asset type charts/legends.
 *
 * Colors chosen for chart distinctiveness; they intentionally differ
 * from the CSS theme palette (which targets UI chrome, not data viz).
 */
export const ASSET_TYPE_CONFIG = {
  cash:        { label: 'Tiền mặt',  color: '#4CAF50', icon: '💵' },
  savings:     { label: 'Tiết kiệm', color: '#2196F3', icon: '🏦' },
  stocks:      { label: 'Cổ phiếu',  color: '#9C27B0', icon: '📈' },
  crypto:      { label: 'Crypto',    color: '#FF9800', icon: '₿' },
  gold:        { label: 'Vàng',      color: '#FFD700', icon: '🥇' },
  real_estate: { label: 'BĐS',       color: '#795548', icon: '🏠' },
  vehicle:     { label: 'Xe cộ',     color: '#607D8B', icon: '🚗' },
  debt:        { label: 'Khoản vay', color: '#F44336', icon: '💳', isLiability: true },
  other:       { label: 'Khác',      color: '#9E9E9E', icon: '📦' },
};

/**
 * Color-only lookup (for backwards compatibility with DashboardPage TYPE_COLORS).
 * @type {Record<string, string>}
 */
export const ASSET_TYPE_COLORS = Object.fromEntries(
  Object.entries(ASSET_TYPE_CONFIG).map(([k, v]) => [k, v.color])
);

/**
 * Label-only lookup.
 * @type {Record<string, string>}
 */
export const ASSET_TYPE_LABELS = Object.fromEntries(
  Object.entries(ASSET_TYPE_CONFIG).map(([k, v]) => [k, v.label])
);
