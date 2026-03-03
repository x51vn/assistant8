/**
 * PromptImprovementPage.jsx — Main page: Daily Review + Tabs (Runs 7d | Lessons)
 *
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { DailyReviewCard } from '../components/promptImprovement/DailyReviewCard.jsx';
import { RunsTab } from '../components/promptImprovement/RunsTab.jsx';
import { LessonsTab } from '../components/promptImprovement/LessonsTab.jsx';

const TABS = [
  { key: 'runs', label: 'Runs (7d)', icon: 'fas fa-play-circle' },
  { key: 'lessons', label: 'Lessons', icon: 'fas fa-lightbulb' },
];

export function PromptImprovementPage() {
  const [activeTab, setActiveTab] = useState('runs');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div class="page-container pi-page">
      {/* Page header */}
      <div class="page-header">
        <h2><i class="fas fa-star-half-alt"></i> Đánh giá Prompt</h2>
      </div>

      {/* Daily review card */}
      <DailyReviewCard key={`daily-${refreshKey}`} onRefresh={handleRefresh} />

      {/* Tab bar */}
      <div class="pi-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            class={`pi-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <i class={tab.icon}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div class="pi-tab-content">
        {activeTab === 'runs' && <RunsTab key={`runs-${refreshKey}`} />}
        {activeTab === 'lessons' && <LessonsTab key={`lessons-${refreshKey}`} />}
      </div>
    </div>
  );
}
