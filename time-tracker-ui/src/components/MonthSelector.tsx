import React from 'react';
import type { MonthSummary, OverallSaldoSummary } from '../types';

interface MonthSelectorProps {
  months: MonthSummary[];
  activeMonth: string;
  onSelectMonth: (monthKey: string) => void;
  overallSaldo?: OverallSaldoSummary;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({
  months,
  activeMonth,
  onSelectMonth,
  overallSaldo,
}) => {
  if (months.length === 0) return null;

  const isOverallPositive = (overallSaldo?.workBalanceSeconds ?? 0) >= 0;

  return (
    <div className="month-selector-container">
      <div className="month-tabs" role="tablist" aria-label="Select Month">
        {overallSaldo && (
          <div
            className="month-tab general-saldo-badge"
            style={{
              cursor: 'default',
              borderColor: isOverallPositive
                ? 'rgba(52, 211, 153, 0.35)'
                : 'rgba(248, 113, 113, 0.35)',
              background: isOverallPositive
                ? 'rgba(16, 185, 129, 0.08)'
                : 'rgba(239, 68, 68, 0.08)',
            }}
            title={`General Saldo across ${overallSaldo.monthsCount} month(s): ${overallSaldo.totalWorkFormatted} worked vs. ${overallSaldo.expectedWorkFormatted} expected (excl. today)`}
          >
            <span className="month-name" style={{ color: '#f8fafc' }}>
              General Saldo:{' '}
              <span
                style={{
                  color: isOverallPositive ? '#34d399' : '#f87171',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {overallSaldo.workBalanceFormatted}
              </span>
            </span>
            <span className="month-chip">
              {overallSaldo.monthsCount} {overallSaldo.monthsCount === 1 ? 'month' : 'months'} •{' '}
              {overallSaldo.totalWorkFormatted} / {overallSaldo.expectedWorkFormatted}
            </span>
          </div>
        )}

        {months.map((m) => {
          const isActive = m.monthKey === activeMonth;
          const isMonthPositive = m.workBalanceSeconds >= 0;
          return (
            <button
              key={m.monthKey}
              role="tab"
              aria-selected={isActive}
              className={`month-tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectMonth(m.monthKey)}
            >
              <span className="month-name">{m.monthLabel}</span>
              <span className="month-chip">
                {m.activeDaysCount} days • {m.totalWorkFormatted}{' '}
                <span
                  style={{
                    color: isMonthPositive ? '#34d399' : '#f87171',
                    fontWeight: 700,
                  }}
                  title={`Month Saldo: ${m.workBalanceFormatted} (vs. ${m.expectedWorkFormatted} expected)`}
                >
                  ({m.workBalanceFormatted})
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
