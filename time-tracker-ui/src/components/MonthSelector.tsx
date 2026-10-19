import React from 'react';
import type { MonthSummary } from '../types';

interface MonthSelectorProps {
  months: MonthSummary[];
  activeMonth: string;
  onSelectMonth: (monthKey: string) => void;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({
  months,
  activeMonth,
  onSelectMonth,
}) => {
  if (months.length === 0) return null;

  return (
    <div className="month-selector-container">
      <div className="month-tabs" role="tablist" aria-label="Select Month">
        {months.map((m) => {
          const isActive = m.monthKey === activeMonth;
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
                {m.activeDaysCount} days • {m.totalWorkFormatted}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
