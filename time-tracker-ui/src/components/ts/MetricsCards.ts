import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MonthSummary, LunchConfig, OverallSaldoSummary } from '../../types';
import clockIcon from '../../assets/icons/clock.svg';
import activityIcon from '../../assets/icons/activity.svg';
import clockTargetIcon from '../../assets/icons/clock-target.svg';
import calendarIcon from '../../assets/icons/calendar.svg';
import startDoorIcon from '../../assets/icons/start-door.svg';
import endDoorIcon from '../../assets/icons/end-door.svg';
import template from '../html/MetricsCards.html?raw';

@Component({
  selector: 'app-metrics-cards',
  standalone: true,
  imports: [CommonModule],
  template,
})
export class MetricsCardsComponent {
  @Input() summary!: MonthSummary;
  @Input() lunchConfig?: LunchConfig;
  @Input() overallSaldo?: OverallSaldoSummary;

  readonly clockIcon = clockIcon;
  readonly activityIcon = activityIcon;
  readonly clockTargetIcon = clockTargetIcon;
  readonly calendarIcon = calendarIcon;
  readonly startDoorIcon = startDoorIcon;
  readonly endDoorIcon = endDoorIcon;

  get hoursPerDay(): number {
    return this.lunchConfig?.defaultWorkHoursPerDay || 8;
  }

  get isPositiveBalance(): boolean {
    return (this.summary?.workBalanceSeconds ?? 0) >= 0;
  }

  get isOverallPositive(): boolean {
    return (this.overallSaldo?.workBalanceSeconds ?? 0) >= 0;
  }
}
