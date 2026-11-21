import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import type { CustomBreak, DayOverride, BreakIconType } from '../../types';
import { BreakIconPickerComponent } from './BreakIcon';
import calendarPlusIcon from '../../assets/icons/calendar-plus.svg';
import template from '../html/CustomWorkDayModal.html?raw';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function time24ToSeconds(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

const normalize24hTime = (t: string): string => t.trim().slice(0, 5);

@Component({
  selector: 'app-custom-work-day-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, BreakIconPickerComponent],
  template,
})
export class CustomWorkDayModalComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() isOpen = false;
  @Input() startWorkDate = '';
  @Input() userOverrides: Record<string, DayOverride> = {};
  @Input() onSaveWorkDay?: (
    date: string,
    start: string | null,
    end: string | null,
    breaks: CustomBreak[] | null
  ) => Promise<void>;
  @Output() closeModal = new EventEmitter<void>();

  date = '';
  startTime = '08:30';
  endTime = '17:30';
  breaks: CustomBreak[] = [];
  newBreakStart = '15:00';
  newBreakEnd = '15:30';
  newBreakIcon: BreakIconType = 'coffee';
  isSaving = false;
  error: string | null = null;

  readonly calendarPlusIcon = calendarPlusIcon;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      this.date = today;
      this.loadForDate(today);
      this.error = null;
    }
  }

  loadForDate(selectedDate: string): void {
    const existing = this.userOverrides?.[selectedDate];
    this.startTime = existing?.start ? normalize24hTime(existing.start) : '08:30';
    this.endTime = existing?.end ? normalize24hTime(existing.end) : '17:30';
    this.breaks = existing?.breaks
      ? existing.breaks.map((b) => ({
          start: normalize24hTime(b.start),
          end: normalize24hTime(b.end),
          icon: b.icon || 'coffee',
        }))
      : [];
  }

  handleDateChange(newDate: string): void {
    this.date = newDate;
    this.loadForDate(newDate);
    this.error = null;
  }

  handleAddBreak(): void {
    const s = this.newBreakStart.trim();
    const e = this.newBreakEnd.trim();
    if (!TIME_24H_REGEX.test(s) || !TIME_24H_REGEX.test(e)) {
      this.error = 'Custom break times must use 24h format HH:mm (e.g. 15:00 to 15:30).';
      return;
    }
    if (time24ToSeconds(e) <= time24ToSeconds(s)) {
      this.error = 'Break end time must be after break start time.';
      return;
    }
    this.breaks = [
      ...this.breaks,
      { start: normalize24hTime(s), end: normalize24hTime(e), icon: this.newBreakIcon },
    ];
    this.error = null;
  }

  updateBreakIcon(idx: number, icon: BreakIconType): void {
    this.breaks = this.breaks.map((item, i) => (i === idx ? { ...item, icon } : item));
  }

  handleRemoveBreak(idx: number): void {
    this.breaks = this.breaks.filter((_, i) => i !== idx);
  }

  async handleSubmit(): Promise<void> {
    const dTrim = this.date.trim();
    const sTrim = this.startTime.trim();
    const eTrim = this.endTime.trim();

    if (!DATE_REGEX.test(dTrim)) {
      this.error = 'Please select a valid date (YYYY-MM-DD).';
      return;
    }
    if (this.startWorkDate && dTrim < this.startWorkDate) {
      this.error = `Date cannot be earlier than your start work date (${this.startWorkDate}).`;
      return;
    }
    if (!sTrim || !TIME_24H_REGEX.test(sTrim)) {
      this.error = 'Please enter a valid start time in 24h HH:mm format (hours and minutes only).';
      return;
    }
    if (eTrim && !TIME_24H_REGEX.test(eTrim)) {
      this.error = 'Please enter a valid end time in 24h HH:mm format (or leave empty).';
      return;
    }
    if (eTrim && time24ToSeconds(eTrim) <= time24ToSeconds(sTrim)) {
      this.error = 'End work time must be after start work time.';
      return;
    }

    this.isSaving = true;
    this.error = null;
    try {
      if (this.onSaveWorkDay) {
        await this.onSaveWorkDay(
          dTrim,
          normalize24hTime(sTrim),
          eTrim ? normalize24hTime(eTrim) : null,
          this.breaks.length > 0 ? this.breaks : null
        );
      }
      this.closeModal.emit();
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Failed to save custom work day.';
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }
}
