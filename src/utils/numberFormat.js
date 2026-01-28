export function formatCompactNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const num = Number(value);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  const units = [
    { value: 1e12, symbol: 'T' },
    { value: 1e9, symbol: 'B' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'K' },
  ];

  for (const unit of units) {
    if (abs >= unit.value) {
      const v = abs / unit.value;
      const fixed = v.toFixed(decimals);
      // Trim trailing zeros and dot
      const trimmed = fixed.replace(/\.0+$|(?<=\.[0-9]*?)0+$/,'');
      return `${sign}${trimmed}${unit.symbol}`;
    }
  }

  // For small numbers, show no suffix, format with commas and up to decimals
  const fixedSmall = num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return fixedSmall;
}

export function formatCompactCurrency(value, decimals = 2, locale = 'vi-VN', currency = 'VND') {
  if (value === null || value === undefined || isNaN(value)) return '-';
  // If value is large, use compact suffix and append currency short code
  const abs = Math.abs(Number(value));
  if (abs >= 1e3) {
    const compact = formatCompactNumber(value, decimals);
    // Do not append literal currency code; default currency is VND
    // Return compact form only (e.g., "200M") — localized currency used for small amounts
    return `${compact}`;
  }

  // For small amounts, fall back to localized currency
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
