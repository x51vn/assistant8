/**
 * Password strength evaluator — shared between RegisterForm & ChangePasswordSection.
 *
 * Returns semantic CSS-variable names for colors so the indicator adapts
 * to the active theme (light / dark).
 *
 * @param {string} password
 * @returns {{ score: number, label: string, color: string }}
 */
export function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Yếu',        color: 'var(--danger-color, #e74c3c)' };
  if (score <= 4) return { score, label: 'Trung bình',  color: 'var(--warning-color, #f39c12)' };
  return             { score, label: 'Mạnh',          color: 'var(--success-color, #27ae60)' };
}

/**
 * Standard password policy regex.
 * Requires: 1 uppercase, 1 lowercase, 1 digit, 1 special char, ≥ 8 total.
 */
export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/;
