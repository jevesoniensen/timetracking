import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { DayOverride } from '../../types';
import sunIcon from '../../assets/icons/sun.svg';
import checkCircleIcon from '../../assets/icons/check-circle.svg';
import template from '../html/VacationModal.html?raw';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

@Component({
  selector: 'app-vacation-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
  ],
  template,
})
export class VacationModalComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() isOpen = false;
  @Input() startWorkDate = '';
  @Input() userOverrides: Record<string, DayOverride> = {};
  @Input() onSaveVacation?: (
    startDate: string,
    endDate: string,
    excludeWeekends: boolean,
    vacation: boolean
  ) => Promise<void>;
  @Output() closeModal = new EventEmitter<void>();

  mode: 'day' | 'period' = 'day';
  startDate = '';
  endDate = '';
  excludeWeekends = true;
  previewDates: string[] = [];
  isSaving = false;
  error: string | null = null;

  readonly sunIcon = sunIcon;
  readonly checkCircleIcon = checkCircleIcon;

  get effectiveEndDate(): string {
    return this.mode === 'day' ? this.startDate : this.endDate;
  }

  get existingVacationDates(): string[] {
    return Object.entries(this.userOverrides || {})
      .filter(([dateKey, ov]) => Boolean(ov?.vacation) && (!this.startWorkDate || dateKey >= this.startWorkDate))
      .map(([dateKey]) => dateKey)
      .sort((a, b) => b.localeCompare(a));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      this.startDate = today;
      this.endDate = today;
      this.error = null;
      this.refreshPreview();
    }
  }

  setMode(nextMode: 'day' | 'period'): void {
    this.mode = nextMode;
    if (nextMode === 'period' && (!this.endDate || this.endDate < this.startDate)) {
      this.endDate = this.startDate;
    }
    this.error = null;
    this.refreshPreview();
  }

  onSingleDateChange(val: string): void {
    this.endDate = val;
    this.error = null;
    this.refreshPreview();
  }

  onStartDateChange(val: string): void {
    if (this.endDate && val > this.endDate) {
      this.endDate = val;
    }
    this.error = null;
    this.refreshPreview();
  }

  onEndDateChange(): void {
    this.error = null;
    this.refreshPreview();
  }

  refreshPreview(): void {
    if (
      !this.isOpen ||
      !DATE_REGEX.test(this.startDate) ||
      (this.mode === 'period' && !DATE_REGEX.test(this.endDate))
    ) {
      this.previewDates = [];
      return;
    }
    const skipWk = this.mode === 'period' ? this.excludeWeekends : false;
    const params = new URLSearchParams({
      startDate: this.startDate,
      endDate: this.effectiveEndDate,
      excludeWeekends: String(skipWk),
    });
    fetch(`/api/overrides/vacation/preview?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((dates: string[]) => {
        if (Array.isArray(dates)) {
          this.previewDates = dates;
          this.cdr.detectChanges();
        }
      })
      .catch(() => {
        this.previewDates = [];
        this.cdr.detectChanges();
      });
  }

  async handleSubmit(): Promise<void> {
    if (!DATE_REGEX.test(this.startDate)) {
      this.error = 'Please select a valid date (YYYY-MM-DD).';
      return;
    }
    if (this.mode === 'period' && !DATE_REGEX.test(this.endDate)) {
      this.error = 'Please select a valid end date (YYYY-MM-DD).';
      return;
    }
    if (this.startWorkDate && this.startDate < this.startWorkDate && this.effectiveEndDate < this.startWorkDate) {
      this.error = `Vacation dates cannot be earlier than your start work date (${this.startWorkDate}).`;
      return;
    }
    if (this.previewDates.length === 0) {
      this.error = 'No valid workdays in the selected range.';
      return;
    }

    this.isSaving = true;
    this.error = null;
    try {
      if (this.onSaveVacation) {
        await this.onSaveVacation(
          this.startDate,
          this.effectiveEndDate,
          this.mode === 'period' ? this.excludeWeekends : false,
          true
        );
      }
      this.closeModal.emit();
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Failed to save vacation.';
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  async handleRemoveSingleVacation(dateStr: string): Promise<void> {
    this.isSaving = true;
    this.error = null;
    try {
      if (this.onSaveVacation) {
        await this.onSaveVacation(dateStr, dateStr, false, false);
      }
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Failed to remove vacation day.';
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }
}
