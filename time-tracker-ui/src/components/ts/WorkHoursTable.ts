import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { DaySummary, LunchConfig, CustomBreak, TrackerEvent, BreakIconType } from '../../types';
import { BreakIconPickerComponent, getBreakIconLabel } from './BreakIcon';
import searchIcon from '../../assets/icons/search.svg';
import infoCircleIcon from '../../assets/icons/info-circle.svg';
import startDoorIcon from '../../assets/icons/start-door.svg';
import endDoorIcon from '../../assets/icons/end-door.svg';
import lunchPlateIcon from '../../assets/icons/lunch-plate.svg';
import playIcon from '../../assets/icons/play.svg';
import stopIcon from '../../assets/icons/stop.svg';
import template from '../html/WorkHoursTable.html?raw';

const normalize24hTime = (t: string): string => t.trim().slice(0, 5);
const formatTime = (timestamp: string): string => timestamp.split(' ')[1] || timestamp;
const isStartEvent = (ev: TrackerEvent): boolean => ev.type?.toUpperCase() === 'START';
const isEndEvent = (ev: TrackerEvent): boolean => ev.type?.toUpperCase() === 'END';

const HOURS_OPTIONS = Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function time24ToSeconds(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

type SortField = 'date' | 'day' | 'start' | 'end' | 'duration' | 'saldo';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-work-hours-table',
  standalone: true,
  imports: [CommonModule, FormsModule, BreakIconPickerComponent],
  template,
})
export class WorkHoursTableComponent {
  @Input() days: DaySummary[] = [];
  @Input() monthLabel = '';
  @Input() lunchConfig?: LunchConfig;
  @Input() onSaveOverride?: (
    date: string,
    start: string | null,
    end: string | null,
    breaks?: CustomBreak[] | null,
    vacation?: boolean | null
  ) => void;
  @Input() onOpenVacation?: () => void;
  @Input() onOpenCustomWorkDay?: () => void;

  @Output() saveOverride = new EventEmitter<{
    date: string;
    start: string | null;
    end: string | null;
    breaks?: CustomBreak[] | null;
    vacation?: boolean | null;
  }>();

  readonly hoursOptions = HOURS_OPTIONS;
  readonly minutesOptions = MINUTES_OPTIONS;
  readonly getBreakIconLabel = getBreakIconLabel;

  readonly searchIcon = searchIcon;
  readonly infoCircleIcon = infoCircleIcon;
  readonly startDoorIcon = startDoorIcon;
  readonly endDoorIcon = endDoorIcon;
  readonly lunchPlateIcon = lunchPlateIcon;
  readonly playIcon = playIcon;
  readonly stopIcon = stopIcon;

  readonly todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  })();

  filterQuery = '';
  sortField: SortField = 'date';
  sortDirection: SortDirection = 'desc';
  expandedDay: string | null = null;
  editingCell: { date: string; field: 'start' | 'end' } | null = null;
  editHour = '';
  editMinute = '';
  editError: string | null = null;
  activeDropdown: 'hour' | 'minute' | null = null;

  addingBreakDate: string | null = null;
  newBreakStart = '15:00';
  newBreakEnd = '15:30';
  newBreakIcon: BreakIconType = 'coffee';
  breakError: string | null = null;

  get vacationDaysInMonth(): number {
    return (this.days || []).filter((d) => d.isVacation).length;
  }

  get filteredDays(): DaySummary[] {
    const query = this.filterQuery.trim().toLowerCase();
    const list = (this.days || []).filter((d) => {
      if (!query) return true;
      return (
        d.date.toLowerCase().includes(query) ||
        d.formattedDate.toLowerCase().includes(query) ||
        d.dayOfWeekFull.toLowerCase().includes(query) ||
        d.dayOfWeek.toLowerCase().includes(query)
      );
    });

    return list.sort((a, b) => {
      let comparison = 0;
      switch (this.sortField) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'day':
          comparison = a.dayOfWeek.localeCompare(b.dayOfWeek);
          break;
        case 'start':
          comparison = a.startWorkTime.localeCompare(b.startWorkTime);
          break;
        case 'end':
          comparison = a.endWorkTime.localeCompare(b.endWorkTime);
          break;
        case 'duration':
          comparison = a.durationSeconds - b.durationSeconds;
          break;
        case 'saldo':
          comparison = a.workBalanceSeconds - b.workBalanceSeconds;
          break;
      }
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
  }

  toggleSort(field: SortField): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortField = field;
      this.sortDirection = 'desc';
    }
  }

  toggleExpand(date: string): void {
    this.expandedDay = this.expandedDay === date ? null : date;
  }

  isEditing(date: string, field: 'start' | 'end'): boolean {
    return this.editingCell?.date === date && this.editingCell?.field === field;
  }

  startEditing(e: MouseEvent, day: DaySummary, field: 'start' | 'end'): void {
    e.stopPropagation();
    const currentVal =
      field === 'start'
        ? day.startWorkTime !== '—'
          ? normalize24hTime(day.startWorkTime)
          : '08:30'
        : day.endWorkTime !== '—' && day.endWorkTime !== 'In Progress'
        ? normalize24hTime(day.endWorkTime)
        : '17:30';
    const parts = currentVal.split(':');
    const h = (parts[0] || '08').padStart(2, '0');
    const m = (parts[1] || '00').slice(0, 2).padStart(2, '0');

    this.editingCell = { date: day.date, field };
    this.editHour = h;
    this.editMinute = m;
    this.editError = null;
    this.activeDropdown = null;
  }

  cancelEditing(e?: MouseEvent): void {
    if (e) e.stopPropagation();
    this.editingCell = null;
    this.editHour = '';
    this.editMinute = '';
    this.editError = null;
    this.activeDropdown = null;
  }

  toggleDropdown(which: 'hour' | 'minute'): void {
    this.activeDropdown = this.activeDropdown === which ? null : which;
  }

  selectHourOption(h: string): void {
    this.editHour = h;
    this.editError = null;
    this.activeDropdown = null;
  }

  selectMinuteOption(m: string): void {
    this.editMinute = m;
    this.editError = null;
    this.activeDropdown = null;
  }

  handleHourBlur(): void {
    setTimeout(() => {
      if (this.activeDropdown === 'hour') {
        this.activeDropdown = null;
      }
    }, 150);
    if (this.editHour.length === 1) {
      const n = parseInt(this.editHour, 10);
      if (n >= 1 && n <= 9) {
        this.editHour = String(n).padStart(2, '0');
      }
    }
  }

  handleMinuteBlur(): void {
    setTimeout(() => {
      if (this.activeDropdown === 'minute') {
        this.activeDropdown = null;
      }
    }, 150);
    if (this.editMinute.length === 1) {
      this.editMinute = this.editMinute.padStart(2, '0');
    }
  }

  commitEditing(day: DaySummary, field: 'start' | 'end'): void {
    if (!this.onSaveOverride) {
      this.editingCell = null;
      return;
    }

    const hTrim = this.editHour.trim();
    const mTrim = this.editMinute.trim();

    if (!hTrim && !mTrim) {
      this.resetOverride(undefined, day, field);
      this.cancelEditing();
      return;
    }

    const hNum = parseInt(hTrim, 10);
    const mNum = parseInt(mTrim, 10);

    if (
      !/^\d{1,2}$/.test(hTrim) ||
      isNaN(hNum) ||
      hNum < 1 ||
      hNum > 23
    ) {
      this.editError = 'Hour must be between 01 and 23';
      return;
    }

    if (
      !/^\d{1,2}$/.test(mTrim) ||
      isNaN(mNum) ||
      mNum < 0 ||
      mNum > 59
    ) {
      this.editError = 'Minute must be between 00 and 59';
      return;
    }

    const formattedTime = `${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`;
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;

    if (field === 'start') {
      this.onSaveOverride(day.date, formattedTime, currentEndOverride, day.customBreaks, day.isVacation);
    } else {
      this.onSaveOverride(day.date, currentStartOverride, formattedTime, day.customBreaks, day.isVacation);
    }
    this.cancelEditing();
  }

  resetOverride(e: MouseEvent | undefined, day: DaySummary, field: 'start' | 'end'): void {
    if (e) e.stopPropagation();
    if (!this.onSaveOverride) return;
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;

    if (field === 'start') {
      this.onSaveOverride(day.date, null, currentEndOverride, day.customBreaks, day.isVacation);
    } else {
      this.onSaveOverride(day.date, currentStartOverride, null, day.customBreaks, day.isVacation);
    }
  }

  toggleVacation(e: MouseEvent, day: DaySummary): void {
    e.stopPropagation();
    if (!this.onSaveOverride) return;
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;
    this.onSaveOverride(day.date, currentStartOverride, currentEndOverride, day.customBreaks, !day.isVacation);
  }

  private getCurrentTime24h(): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  startWorkDayNow(e: MouseEvent, day: DaySummary): void {
    e.stopPropagation();
    if (!this.onSaveOverride) return;
    const nowTime = this.getCurrentTime24h();
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;
    this.onSaveOverride(day.date, nowTime, currentEndOverride, day.customBreaks, day.isVacation);
  }

  endWorkDayNow(e: MouseEvent, day: DaySummary): void {
    e.stopPropagation();
    if (!this.onSaveOverride) return;
    const nowTime = this.getCurrentTime24h();
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    this.onSaveOverride(day.date, currentStartOverride, nowTime, day.customBreaks, day.isVacation);
  }

  selectEventAsStart(e: MouseEvent, day: DaySummary, ev: TrackerEvent): void {
    e.stopPropagation();
    if (!this.onSaveOverride) return;
    const time = formatTime(ev.timestamp).slice(0, 5);
    const currentEndOverride = day.isEndOverridden ? normalize24hTime(day.endWorkTime) : null;
    this.onSaveOverride(day.date, time, currentEndOverride, day.customBreaks, day.isVacation);
  }

  selectEventAsEnd(e: MouseEvent, day: DaySummary, ev: TrackerEvent): void {
    e.stopPropagation();
    if (!this.onSaveOverride) return;
    const time = formatTime(ev.timestamp).slice(0, 5);
    const currentStartOverride = day.isStartOverridden ? normalize24hTime(day.startWorkTime) : null;
    this.onSaveOverride(day.date, currentStartOverride, time, day.customBreaks, day.isVacation);
  }

  openAddBreak(e: MouseEvent, date: string): void {
    e.stopPropagation();
    this.addingBreakDate = date;
    this.newBreakStart = '15:00';
    this.newBreakEnd = '15:30';
    this.newBreakIcon = 'coffee';
    this.breakError = null;
  }

  cancelAddBreak(e?: MouseEvent): void {
    if (e) e.stopPropagation();
    this.addingBreakDate = null;
    this.breakError = null;
  }

  commitAddBreak(day: DaySummary): void {
    if (!this.onSaveOverride) {
      this.addingBreakDate = null;
      return;
    }

    const s = this.newBreakStart.trim();
    const e = this.newBreakEnd.trim();

    if (!TIME_24H_REGEX.test(s) || !TIME_24H_REGEX.test(e)) {
      this.breakError = 'Use 24h format HH:mm (e.g. 15:00 to 15:30)';
      return;
    }
    if (time24ToSeconds(e) <= time24ToSeconds(s)) {
      this.breakError = 'Break end must be after break start';
      return;
    }

    const currentStartOverride = day.isStartOverridden ? day.startWorkTime : null;
    const currentEndOverride = day.isEndOverridden ? day.endWorkTime : null;
    const nextBreaks: CustomBreak[] = [
      ...(day.customBreaks || []),
      { start: s, end: e, icon: this.newBreakIcon },
    ];

    this.onSaveOverride(day.date, currentStartOverride, currentEndOverride, nextBreaks, day.isVacation);
    this.addingBreakDate = null;
    this.breakError = null;
  }

  updateCustomBreakIcon(day: DaySummary, index: number, icon: BreakIconType): void {
    if (!this.onSaveOverride) return;
    const currentStartOverride = day.isStartOverridden ? day.startWorkTime : null;
    const currentEndOverride = day.isEndOverridden ? day.endWorkTime : null;
    const nextBreaks = day.customBreaks.map((b, idx) =>
      idx === index ? { ...b, icon } : b
    );
    this.onSaveOverride(day.date, currentStartOverride, currentEndOverride, nextBreaks, day.isVacation);
  }

  removeCustomBreak(e: MouseEvent, day: DaySummary, index: number): void {
    e.stopPropagation();
    if (!this.onSaveOverride) return;
    const currentStartOverride = day.isStartOverridden ? day.startWorkTime : null;
    const currentEndOverride = day.isEndOverridden ? day.endWorkTime : null;
    const nextBreaks = day.customBreaks.filter((_, idx) => idx !== index);
    this.onSaveOverride(day.date, currentStartOverride, currentEndOverride, nextBreaks, day.isVacation);
  }

  getDurationPercent(durationSeconds: number): number {
    return Math.min(100, Math.round((durationSeconds / (9 * 3600)) * 100));
  }

  isStart(ev: TrackerEvent): boolean {
    return isStartEvent(ev);
  }

  isEnd(ev: TrackerEvent): boolean {
    return isEndEvent(ev);
  }

  isActiveStart(day: DaySummary, ev: TrackerEvent): boolean {
    return Boolean(day.effectiveStartTimestamp && ev.timestamp === day.effectiveStartTimestamp);
  }

  isActiveEnd(day: DaySummary, ev: TrackerEvent): boolean {
    return Boolean(day.effectiveEndTimestamp && ev.timestamp === day.effectiveEndTimestamp);
  }

  isDefaultStart(day: DaySummary, ev: TrackerEvent): boolean {
    return Boolean(day.firstStartup && ev.timestamp === day.firstStartup.timestamp);
  }

  isDefaultEnd(day: DaySummary, ev: TrackerEvent): boolean {
    return Boolean(day.lastShutdown && ev.timestamp === day.lastShutdown.timestamp);
  }

  formatEvTime(ts: string): string {
    return formatTime(ts);
  }
}
