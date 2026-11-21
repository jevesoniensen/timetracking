import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HeaderComponent } from './Header';
import { MonthSelectorComponent } from './MonthSelector';
import { MetricsCardsComponent } from './MetricsCards';
import { WorkHoursTableComponent } from './WorkHoursTable';
import { UploadModalComponent, UploadMode } from './UploadModal';
import { StartWorkDateModalComponent } from './StartWorkDateModal';
import { VacationModalComponent } from './VacationModal';
import { CustomWorkDayModalComponent } from './CustomWorkDayModal';
import checkCircleIcon from '../../assets/icons/check-circle.svg';
import template from '../html/App.html?raw';
import type {
  EventsApiResponse,
  LunchConfig,
  DayOverride,
  CustomBreak,
  MonthSummary,
  OverallSaldoSummary,
} from '../../types';

const DEFAULT_LUNCH_CONFIG: LunchConfig = {
  defaultLunchStart: '12:30',
  defaultLunchEnd: '13:30',
  defaultWorkHoursPerDay: 8,
  startWorkDate: '',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    HeaderComponent,
    MonthSelectorComponent,
    MetricsCardsComponent,
    WorkHoursTableComponent,
    UploadModalComponent,
    StartWorkDateModalComponent,
    VacationModalComponent,
    CustomWorkDayModalComponent,
  ],
  template,
})
export class AppComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  monthSummaries: Record<string, MonthSummary> = {};
  overallSaldo?: OverallSaldoSummary;
  lunchConfig: LunchConfig = DEFAULT_LUNCH_CONFIG;
  userOverrides: Record<string, DayOverride> = {};
  selectedMonth = '';
  isLoading = true;
  isLive = false;
  isUploadOpen = false;
  uploadMode: UploadMode = 'events';
  isStartDateModalOpen = false;
  isVacationModalOpen = false;
  isCustomWorkDayModalOpen = false;
  errorMsg: string | null = null;
  toastMsg: string | null = null;

  readonly checkCircleIcon = checkCircleIcon;

  readonly boundSaveOverride = this.handleSaveOverride.bind(this);
  readonly boundSaveStartWorkDate = this.handleSaveStartWorkDate.bind(this);
  readonly boundSaveVacation = this.handleSaveVacation.bind(this);
  readonly boundUploadLog = this.handleUploadLog.bind(this);
  readonly boundOpenVacation = () => {
    this.isVacationModalOpen = true;
  };
  readonly boundOpenCustomWorkDay = () => {
    this.isCustomWorkDayModalOpen = true;
  };
  readonly boundSaveCustomWorkDay = async (
    date: string,
    start: string | null,
    end: string | null,
    breaks: CustomBreak[] | null
  ) => {
    await this.handleSaveOverride(date, start, end, breaks, false);
    if (date.length >= 7) {
      this.selectedMonth = date.slice(0, 7);
    }
  };

  get monthList(): MonthSummary[] {
    return Object.values(this.monthSummaries);
  }

  get activeMonthSummary(): MonthSummary | null {
    return (
      this.monthSummaries[this.selectedMonth] ||
      (this.monthList.length > 0 ? this.monthList[0] : null)
    );
  }

  async ngOnInit(): Promise<void> {
    await this.fetchEvents(false);
    void this.syncEventsQuietly();
  }

  private async syncEventsQuietly(): Promise<void> {
    try {
      const response = await fetch('/api/events?sync=true');
      if (response.ok) {
        const data: EventsApiResponse = await response.json();
        this.applyServerResponse(data, false);
      }
    } catch {
      // Ignore background sync errors if initial load already succeeded
    }
  }

  openUploadModal(mode: UploadMode = 'events'): void {
    this.uploadMode = mode;
    this.isUploadOpen = true;
  }

  showToast(msg: string): void {
    this.toastMsg = msg;
    this.cdr.detectChanges();
    setTimeout(() => {
      if (this.toastMsg === msg) {
        this.toastMsg = null;
        this.cdr.detectChanges();
      }
    }, 4500);
  }

  private applyServerResponse(data: EventsApiResponse, checkStartWorkDate = false): void {
    if (data.lunchConfig) {
      this.lunchConfig = data.lunchConfig;
      if (
        checkStartWorkDate &&
        (!data.lunchConfig.startWorkDate || !data.lunchConfig.startWorkDate.trim())
      ) {
        this.isStartDateModalOpen = true;
      }
    } else if (checkStartWorkDate) {
      this.isStartDateModalOpen = true;
    }
    if (data.userOverrides) {
      this.userOverrides = data.userOverrides;
    }
    if (data.monthSummaries) {
      this.monthSummaries = data.monthSummaries;
      const list = Object.values(data.monthSummaries);
      if (list.length > 0 && (!this.selectedMonth || !data.monthSummaries[this.selectedMonth])) {
        this.selectedMonth = list[0].monthKey;
      }
    }
    if (data.overallSaldo) {
      this.overallSaldo = data.overallSaldo;
    }
    this.isLive = true;
    this.cdr.detectChanges();
  }

  async fetchEvents(sync = false): Promise<void> {
    this.isLoading = true;
    this.errorMsg = null;
    this.cdr.detectChanges();
    try {
      const url = sync ? '/api/events?sync=true' : '/api/events';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data: EventsApiResponse = await response.json();
      this.applyServerResponse(data, true);
    } catch {
      this.isLive = false;
      this.errorMsg = 'Unable to connect to local TimeTracker server.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async handleSaveStartWorkDate(startWorkDate: string): Promise<void> {
    const cleanDate = startWorkDate.trim();
    const response = await fetch('/api/config/start-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startWorkDate: cleanDate }),
    });
    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }
    const data: EventsApiResponse = await response.json();
    this.applyServerResponse(data, false);
    this.isStartDateModalOpen = false;
    this.showToast(`Saved Start Work Date (${cleanDate}) to config.properties`);
  }

  async handleSaveOverride(
    date: string,
    start: string | null,
    end: string | null,
    breaks?: CustomBreak[] | null,
    vacation?: boolean | null
  ): Promise<void> {
    const cleanBreaks = breaks && breaks.length > 0 ? breaks : null;
    const cleanVacation = vacation === true ? true : null;
    const isEmpty = !start && !end && !cleanBreaks && !cleanVacation;

    try {
      const response = await fetch('/api/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          start,
          end,
          breaks: cleanBreaks,
          vacation: cleanVacation,
        }),
      });
      if (response.ok) {
        const data: EventsApiResponse = await response.json();
        this.applyServerResponse(data, false);
        const monthKey = date.slice(0, 7);
        this.showToast(
          isEmpty
            ? `Reset overrides for ${date}`
            : `Saved overrides for ${date} in overrides/user-overrides-${monthKey}.json`
        );
      }
    } catch {
      this.errorMsg = 'Failed to save override to local server.';
      this.cdr.detectChanges();
    }
  }

  async handleSaveVacation(
    startDate: string,
    endDate: string,
    excludeWeekends: boolean,
    vacation: boolean
  ): Promise<void> {
    const response = await fetch('/api/overrides/vacation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate,
        endDate,
        excludeWeekends,
        vacation,
      }),
    });
    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }
    const data: EventsApiResponse = await response.json();
    this.applyServerResponse(data, false);

    if (endDate && endDate.length >= 7) {
      this.selectedMonth = endDate.slice(0, 7);
    } else if (startDate && startDate.length >= 7) {
      this.selectedMonth = startDate.slice(0, 7);
    }

    this.showToast(
      vacation
        ? `Saved vacation (${startDate === endDate ? startDate : `${startDate} – ${endDate}`}) in user overrides`
        : `Removed vacation for ${startDate === endDate ? startDate : `${startDate} – ${endDate}`}`
    );
  }

  async handleUploadLog(
    content: string,
    clearAll: boolean,
    mode: UploadMode = 'events'
  ): Promise<void> {
    this.isLoading = true;
    this.errorMsg = null;
    try {
      const endpoint =
        mode === 'overrides'
          ? `/api/overrides/upload?clearAll=${clearAll}`
          : `/api/events/upload?clearAll=${clearAll}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data: EventsApiResponse = await response.json();
      this.applyServerResponse(data, false);

      if (data.months && data.months.length > 0) {
        this.selectedMonth = data.months[0];
      }

      this.showToast(
        mode === 'overrides'
          ? 'Successfully imported user overrides.'
          : 'Successfully imported events log.'
      );
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  handleExportCsv(): void {
    if (!this.activeMonthSummary) return;
    const link = document.createElement('a');
    link.setAttribute('href', `/api/events/${this.activeMonthSummary.monthKey}/csv`);
    link.setAttribute('download', `work-hours-${this.activeMonthSummary.monthKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
