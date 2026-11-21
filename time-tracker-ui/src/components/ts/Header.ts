import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import clockIcon from '../../assets/icons/clock.svg';
import calendarPlusIcon from '../../assets/icons/calendar-plus.svg';
import sunIcon from '../../assets/icons/sun.svg';
import refreshIcon from '../../assets/icons/refresh.svg';
import downloadIcon from '../../assets/icons/download.svg';
import moreVerticalIcon from '../../assets/icons/more-vertical.svg';
import uploadIcon from '../../assets/icons/upload.svg';
import editIcon from '../../assets/icons/edit.svg';
import template from '../html/Header.html?raw';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatMenuModule, MatTooltipModule],
  template,
})
export class HeaderComponent {
  @Input() isLoading = false;
  @Input() activeMonthLabel = 'Current Month';

  @Output() refresh = new EventEmitter<void>();
  @Output() exportCsv = new EventEmitter<void>();
  @Output() openUpload = new EventEmitter<'events' | 'overrides'>();
  @Output() openVacation = new EventEmitter<void>();
  @Output() openCustomWorkDay = new EventEmitter<void>();

  readonly clockIcon = clockIcon;
  readonly calendarPlusIcon = calendarPlusIcon;
  readonly sunIcon = sunIcon;
  readonly refreshIcon = refreshIcon;
  readonly downloadIcon = downloadIcon;
  readonly moreVerticalIcon = moreVerticalIcon;
  readonly uploadIcon = uploadIcon;
  readonly editIcon = editIcon;

  selectUpload(mode: 'events' | 'overrides'): void {
    this.openUpload.emit(mode);
  }
}
