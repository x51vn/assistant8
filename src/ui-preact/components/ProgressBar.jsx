import { h } from 'preact';

const TONES = new Set(['primary', 'success', 'warning', 'danger', 'neutral']);
const SIZES = new Set(['sm', 'md']);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeProgress(value, max) {
  const numericMax = toNumber(max);
  if (numericMax <= 0) {
    return { percent: 0, value: 0, max: 100 };
  }

  const clampedValue = clamp(toNumber(value), 0, numericMax);
  return {
    percent: Math.round((clampedValue / numericMax) * 100),
    value: clampedValue,
    max: numericMax,
  };
}

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  ariaLabel,
  caption,
  tone = 'primary',
  size = 'md',
  indeterminate = false,
  showValue = false,
  className = '',
}) {
  const safeTone = TONES.has(tone) ? tone : 'primary';
  const safeSize = SIZES.has(size) ? size : 'md';
  const normalized = normalizeProgress(value, max);
  const accessibleName = ariaLabel || label || caption || 'Progress';
  const percentText = `${normalized.percent}%`;
  const rootClasses = [
    'progressbar',
    `progressbar--${safeTone}`,
    `progressbar--${safeSize}`,
    indeterminate ? 'progressbar--indeterminate' : '',
    className,
  ].filter(Boolean).join(' ');

  const ariaProps = indeterminate
    ? {}
    : {
        'aria-valuemin': 0,
        'aria-valuemax': normalized.max,
        'aria-valuenow': normalized.value,
        'aria-valuetext': percentText,
      };

  return (
    <div class={rootClasses} role="progressbar" aria-label={accessibleName} {...ariaProps}>
      {(label || showValue) && (
        <div class="progressbar__header">
          {label && <span class="progressbar__label">{label}</span>}
          {showValue && !indeterminate && <span class="progressbar__value">{percentText}</span>}
        </div>
      )}
      <div class="progressbar__track" aria-hidden="true">
        <div
          class="progressbar__fill"
          style={indeterminate ? undefined : { width: percentText }}
        />
      </div>
      {caption && <div class="progressbar__caption">{caption}</div>}
    </div>
  );
}

export default ProgressBar;
