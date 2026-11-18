import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = timelineRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    window.addEventListener('resize', updateScrollButtons);
    return () => window.removeEventListener('resize', updateScrollButtons);
  }, [months, updateScrollButtons]);

  if (months.length === 0) return null;

  const isOverallPositive = (overallSaldo?.workBalanceSeconds ?? 0) >= 0;

  const scrollTimeline = (direction: 'left' | 'right') => {
    const el = timelineRef.current;
    if (!el) return;
    const step = Math.max(240, Math.floor(el.clientWidth * 0.65));
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = timelineRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="month-selector-container">
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

      <div className="month-timeline-wrapper">
        {canScrollLeft && (
          <button
            type="button"
            className="timeline-nav-btn left"
            onClick={() => scrollTimeline('left')}
            title="Show newer months"
            aria-label="Scroll timeline left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        <div
          ref={timelineRef}
          className="month-timeline"
          role="tablist"
          aria-label="Select Month"
          onScroll={updateScrollButtons}
          onWheel={handleWheel}
        >
          {months.map((m) => {
            const isActive = m.monthKey === activeMonth;
            const isMonthPositive = m.workBalanceSeconds >= 0;
            return (
              <button
                key={m.monthKey}
                role="tab"
                aria-selected={isActive}
                className={`month-tab timeline-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectMonth(m.monthKey)}
              >
                <span className="timeline-node" aria-hidden="true"></span>
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

        {canScrollRight && (
          <button
            type="button"
            className="timeline-nav-btn right"
            onClick={() => scrollTimeline('right')}
            title="Show older months"
            aria-label="Scroll timeline right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
