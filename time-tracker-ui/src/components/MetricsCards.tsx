import React from 'react';
import type { MonthSummary, LunchConfig, OverallSaldoSummary } from '../types';

interface MetricsCardsProps {
  summary: MonthSummary;
  lunchConfig?: LunchConfig;
  overallSaldo?: OverallSaldoSummary;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  summary,
  lunchConfig,
  overallSaldo,
}) => {
  const hoursPerDay = lunchConfig?.defaultWorkHoursPerDay || 8;
  const isPositiveBalance = summary.workBalanceSeconds >= 0;
  const isOverallPositive = (overallSaldo?.workBalanceSeconds ?? 0) >= 0;

  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <div className="metric-icon-box cyan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Month Worked &amp; Saldo</span>
          <div className="metric-value">
            {summary.totalWorkFormatted}{' '}
            <span
              className="metric-unit"
              style={{
                color: isPositiveBalance ? '#34d399' : '#f87171',
                fontWeight: 700,
              }}
              title="Month Saldo vs. Month Work Expectation (excluding today)"
            >
              ({summary.workBalanceFormatted})
            </span>
          </div>
          <span className="metric-hint">
            Across {summary.activeDaysCount} active days in {summary.monthLabel} (excl. today)
          </span>
        </div>
      </div>

      {overallSaldo && (
        <div className="metric-card">
          <div className={`metric-icon-box ${isOverallPositive ? 'emerald' : 'amber'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-label">General Saldo (All Months)</span>
            <div
              className="metric-value"
              style={{ color: isOverallPositive ? '#34d399' : '#f87171' }}
            >
              {overallSaldo.workBalanceFormatted}
            </div>
            <span className="metric-hint">
              {overallSaldo.totalWorkFormatted} worked / {overallSaldo.expectedWorkFormatted} expected ({overallSaldo.monthsCount} {overallSaldo.monthsCount === 1 ? 'month' : 'months'})
            </span>
          </div>
        </div>
      )}

      <div className="metric-card">
        <div className="metric-icon-box amber">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l2 2" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Month Work Expectation</span>
          <div className="metric-value">{summary.expectedWorkFormatted}</div>
          <span className="metric-hint">
            {summary.expectedWorkDaysCount} workdays × {hoursPerDay}h/day
            {summary.vacationDaysCount > 0 ? ` (${summary.vacationDaysCount} vacation)` : ''} (excl. today)
          </span>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon-box emerald">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Working Days</span>
          <div className="metric-value">
            {summary.activeDaysCount} / {summary.expectedWorkDaysCount}{' '}
            <span className="metric-unit">days</span>
          </div>
          <span className="metric-hint">
            {summary.vacationDaysCount > 0
              ? `${summary.vacationDaysCount} vacation ${summary.vacationDaysCount === 1 ? 'day' : 'days'} in ${summary.monthLabel}`
              : `Logged vs. expected in ${summary.monthLabel}`}
          </span>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon-box green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Avg. Start Work</span>
          <div className="metric-value">{summary.avgStartWork}</div>
          <span className="metric-hint">First startup (excl. today)</span>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon-box indigo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Avg. End Work</span>
          <div className="metric-value">{summary.avgEndWork}</div>
          <span className="metric-hint">Last shutdown (excl. today)</span>
        </div>
      </div>
    </div>
  );
};
