import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  HostListener,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule],
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

  menuOpen = false;
  readonly clockIcon = clockIcon;
  readonly calendarPlusIcon = calendarPlusIcon;
  readonly sunIcon = sunIcon;
  readonly refreshIcon = refreshIcon;
  readonly downloadIcon = downloadIcon;
  readonly moreVerticalIcon = moreVerticalIcon;
  readonly uploadIcon = uploadIcon;
  readonly editIcon = editIcon;

  private readonly elRef = inject(ElementRef);

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  selectUpload(mode: 'events' | 'overrides'): void {
    this.menuOpen = false;
    this.openUpload.emit(mode);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.menuOpen && !this.elRef.nativeElement.contains(event.target)) {
      this.menuOpen = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (this.menuOpen && event.key === 'Escape') {
      this.menuOpen = false;
    }
  }
}
