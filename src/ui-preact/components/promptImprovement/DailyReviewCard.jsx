/**
 * DailyReviewCard.jsx – Summary card at top of Prompt Improvement page
 * Shows today's stats and quick-action buttons.
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { getImprovementStats, triggerPurge } from '../../api/promptImprovementApi.js';

export function DailyReviewCard({ onRefresh }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getImprovementStats();
    if (!res.error) setStats(res);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handlePurge = async () => {
    const res = await triggerPurge();
    if (!res.error) {
      load();
      if (onRefresh) onRefresh();
    }
  };

  if (loading || !stats) {
    return (
      <div class="pi-daily-card pi-daily-card--loading">
        <i class="fas fa-spinner fa-spin"></i> Đang tải thống kê...
      </div>
    );
  }

  return (
    <div class="pi-daily-card">
      <div class="pi-daily-card__header">
        <i class="fas fa-calendar-check"></i>
        <strong>Daily Review</strong>
      </div>
      <div class="pi-daily-card__stats">
        <div class="pi-stat">
          <span class="pi-stat__value">{stats.todayRuns}</span>
          <span class="pi-stat__label">Runs hôm nay</span>
        </div>
        <div class="pi-stat">
          <span class="pi-stat__value">{stats.evaluatedToday}</span>
          <span class="pi-stat__label">Đã đánh giá</span>
        </div>
        <div class="pi-stat">
          <span class="pi-stat__value">{stats.activeLessons}</span>
          <span class="pi-stat__label">Lessons active</span>
        </div>
        <div class="pi-stat">
          <span class="pi-stat__value">{stats.totalLessons}</span>
          <span class="pi-stat__label">Tổng lessons</span>
        </div>
      </div>
      <div class="pi-daily-card__actions">
        <button class="btn-sm btn-outline" onClick={handlePurge} title="Dọn dữ liệu hết hạn">
          <i class="fas fa-broom"></i> Purge
        </button>
      </div>
    </div>
  );
}
