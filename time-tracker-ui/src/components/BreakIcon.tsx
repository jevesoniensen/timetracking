import React, { useState, useRef, useEffect } from 'react';
import type { BreakIconType } from '../types';

export interface BreakIconOption {
  id: BreakIconType;
  label: string;
}

export const BREAK_ICON_OPTIONS: BreakIconOption[] = [
  { id: 'coffee', label: 'Coffee Break' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'dentist', label: 'Dentist' },
  { id: 'school', label: 'School' },
  { id: 'bed', label: 'Rest / Bed' },
  { id: 'errand', label: 'Errand' },
];

export const normalizeBreakIcon = (icon?: string | null): BreakIconType => {
  if (icon === 'doctor' || icon === 'dentist' || icon === 'school' || icon === 'bed' || icon === 'errand') {
    return icon;
  }
  return 'coffee';
};

export const getBreakIconLabel = (icon?: string | null): string => {
  const normalized = normalizeBreakIcon(icon);
  return BREAK_ICON_OPTIONS.find((opt) => opt.id === normalized)?.label ?? 'Coffee Break';
};

interface BreakIconProps {
  type?: string | null;
  className?: string;
}

export const BreakIcon: React.FC<BreakIconProps> = ({ type, className = 'time-icon' }) => {
  const normalized = normalizeBreakIcon(type);

  switch (normalized) {
    case 'doctor':
      // Medical bag / cross
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M12 10.5v6" />
          <path d="M9 13.5h6" />
        </svg>
      );
    case 'dentist':
      // Tooth
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3c-2.5 0-4 2-4 5 0 2.5 1 4.5 1.5 7 .5 2.5 1 5.5 2.5 5.5 1.2 0 1.8-2.5 2.5-4.5.5-1.4 1.5-2 2.5-2s2 .6 2.5 2c.7 2 1.3 4.5 2.5 4.5 1.5 0 2-3 2.5-5.5.5-2.5 1.5-4.5 1.5-7 0-3-1.5-5-4-5-1.5 0-2.8.8-5 .8S8.5 3 7 3z" />
        </svg>
      );
    case 'school':
      // Graduation cap
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10L12 5 2 10l10 5 10-5z" />
          <path d="M6 12.5v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
          <path d="M22 10v5" />
        </svg>
      );
    case 'bed':
      // Bed
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 7v11" />
          <path d="M2 14h20v4" />
          <path d="M22 18v-4a4 4 0 0 0-4-4H9v4" />
          <circle cx="5.5" cy="10.5" r="1.5" />
        </svg>
      );
    case 'errand':
      // Briefcase / personal errand
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'coffee':
    default:
      // Coffee mug
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      );
  }
};

interface BreakIconPickerProps {
  value?: string | null;
  onChange: (icon: BreakIconType) => void;
  buttonClassName?: string;
  title?: string;
}

export const BreakIconPicker: React.FC<BreakIconPickerProps> = ({
  value,
  onChange,
  buttonClassName = 'break-icon-trigger',
  title,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const current = normalizeBreakIcon(value);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  return (
    <div className="break-icon-picker" ref={containerRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setIsOpen((prev) => !prev)}
        title={title || `${getBreakIconLabel(current)} — click to change icon`}
        aria-label={`Break icon: ${getBreakIconLabel(current)}`}
      >
        <BreakIcon type={current} />
      </button>
      {isOpen && (
        <div className="break-icon-popover" role="menu">
          {BREAK_ICON_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`break-icon-option ${current === opt.id ? 'active' : ''}`}
              onClick={() => {
                onChange(opt.id);
                setIsOpen(false);
              }}
              title={opt.label}
              aria-label={opt.label}
            >
              <BreakIcon type={opt.id} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

