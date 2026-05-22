import { afterEach, describe, expect, test, vi } from 'vitest';
import { h } from 'preact';
import { act, cleanup, fireEvent, render, waitFor } from '../../test-utils/preact-render.js';
import { AddWatchlistModal } from '../../../src/ui-preact/components/WatchlistForms.jsx';

describe('Watchlist progress indicators', () => {
  afterEach(() => {
    cleanup();
  });

  test('bulk add uses the shared ProgressBar and keeps per-symbol chips', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { container, getByLabelText, getByRole, getByText } = render(
      h(AddWatchlistModal, {
        isOpen: true,
        onClose: vi.fn(),
        onSave,
      })
    );

    await act(async () => {
      fireEvent.input(getByLabelText(/Mã cổ phiếu/i), {
        target: { value: 'AAA, BBB' },
      });
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(getByRole('button', { name: /Thêm 2 mã/i }));
      await Promise.resolve();
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    const progressbar = getByRole('progressbar', {
      name: 'Tiến trình thêm watchlist hàng loạt',
    });

    expect(progressbar.getAttribute('aria-valuemax')).toBe('2');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('2');
    expect(getByText('2/2 mã đã xử lý')).toBeTruthy();
    expect(container.querySelectorAll('.chip--success')).toHaveLength(2);
  });
});
