import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import calendarIcon from '../../assets/icons/calendar.svg';
import template from '../html/StartWorkDateModal.html?raw';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

@Component({
  selector: 'app-start-work-date-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template,
})
export class StartWorkDateModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() defaultSuggestedDate?: string;
  @Input() onSave?: (startWorkDate: string) => Promise<void>;
  @Output() saveStartDate = new EventEmitter<string>();

  dateValue = '';
  isSaving = false;
  error: string | null = null;
  readonly calendarIcon = calendarIcon;

  ngOnChanges(): void {
    if (this.isOpen) {
      if (this.defaultSuggestedDate && DATE_REGEX.test(this.defaultSuggestedDate)) {
        this.dateValue = this.defaultSuggestedDate;
      } else if (!this.dateValue) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        this.dateValue = `${yyyy}-${mm}-01`;
      }
      this.error = null;
    }
  }

  async handleSubmit(): Promise<void> {
    const trimmed = this.dateValue.trim();
    if (!DATE_REGEX.test(trimmed)) {
      this.error = 'Please enter a valid date in YYYY-MM-DD format.';
      return;
    }

    this.isSaving = true;
    this.error = null;
    try {
      if (this.onSave) {
        await this.onSave(trimmed);
      } else {
        this.saveStartDate.emit(trimmed);
      }
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Failed to save start work date.';
    } finally {
      this.isSaving = false;
    }
  }
}
