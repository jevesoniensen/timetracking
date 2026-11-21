import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MonthSummary, OverallSaldoSummary } from '../../types';
import chevronLeftIcon from '../../assets/icons/chevron-left.svg';
import chevronRightIcon from '../../assets/icons/chevron-right.svg';
import template from '../html/MonthSelector.html?raw';

@Component({
  selector: 'app-month-selector',
  standalone: true,
  imports: [CommonModule],
  template,
})
export class MonthSelectorComponent implements AfterViewInit, OnChanges {
  @Input() months: MonthSummary[] = [];
  @Input() activeMonth = '';
  @Input() overallSaldo?: OverallSaldoSummary;
  @Output() selectMonth = new EventEmitter<string>();

  @ViewChild('timelineEl') timelineRef?: ElementRef<HTMLDivElement>;

  canScrollLeft = false;
  canScrollRight = false;
  readonly chevronLeftIcon = chevronLeftIcon;
  readonly chevronRightIcon = chevronRightIcon;

  get isOverallPositive(): boolean {
    return (this.overallSaldo?.workBalanceSeconds ?? 0) >= 0;
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.updateScrollButtons(), 0);
  }

  ngOnChanges(): void {
    setTimeout(() => this.updateScrollButtons(), 0);
  }

  @HostListener('window:resize')
  updateScrollButtons(): void {
    const el = this.timelineRef?.nativeElement;
    if (!el) return;
    this.canScrollLeft = el.scrollLeft > 4;
    this.canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
  }

  scrollTimeline(direction: 'left' | 'right'): void {
    const el = this.timelineRef?.nativeElement;
    if (!el) return;
    const step = Math.max(240, Math.floor(el.clientWidth * 0.65));
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  }

  handleWheel(e: WheelEvent): void {
    const el = this.timelineRef?.nativeElement;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  }
}
