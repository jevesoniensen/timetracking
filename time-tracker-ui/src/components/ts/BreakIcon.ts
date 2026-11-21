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
import type { BreakIconType } from '../../types';
import coffeeIcon from '../../assets/icons/coffee.svg';
import doctorIcon from '../../assets/icons/doctor.svg';
import dentistIcon from '../../assets/icons/dentist.svg';
import schoolIcon from '../../assets/icons/school.svg';
import bedIcon from '../../assets/icons/bed.svg';
import errandIcon from '../../assets/icons/errand.svg';
import breakIconTemplate from '../html/BreakIcon.html?raw';
import breakIconPickerTemplate from '../html/BreakIconPicker.html?raw';

export interface BreakIconOption {
  id: BreakIconType;
  label: string;
  src: string;
}

export const BREAK_ICON_OPTIONS: BreakIconOption[] = [
  { id: 'coffee', label: 'Coffee Break', src: coffeeIcon },
  { id: 'doctor', label: 'Doctor', src: doctorIcon },
  { id: 'dentist', label: 'Dentist', src: dentistIcon },
  { id: 'school', label: 'School', src: schoolIcon },
  { id: 'bed', label: 'Rest / Bed', src: bedIcon },
  { id: 'errand', label: 'Shopping', src: errandIcon },
];

const BREAK_ICON_SRC_MAP: Record<BreakIconType, string> = {
  coffee: coffeeIcon,
  doctor: doctorIcon,
  dentist: dentistIcon,
  school: schoolIcon,
  bed: bedIcon,
  errand: errandIcon,
};

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

@Component({
  selector: 'app-break-icon',
  standalone: true,
  template: breakIconTemplate,
})
export class BreakIconComponent {
  @Input() type?: string | null;
  @Input() className = 'time-icon';

  get iconSrc(): string {
    return BREAK_ICON_SRC_MAP[normalizeBreakIcon(this.type)];
  }

  get iconLabel(): string {
    return getBreakIconLabel(this.type);
  }
}

@Component({
  selector: 'app-break-icon-picker',
  standalone: true,
  imports: [CommonModule, BreakIconComponent],
  template: breakIconPickerTemplate,
})
export class BreakIconPickerComponent {
  @Input() value?: string | null;
  @Input() buttonClassName = 'break-icon-trigger';
  @Input() title?: string;
  @Output() iconChange = new EventEmitter<BreakIconType>();

  isOpen = false;
  readonly options = BREAK_ICON_OPTIONS;
  private readonly elRef = inject(ElementRef);

  get current(): BreakIconType {
    return normalizeBreakIcon(this.value);
  }

  get currentLabel(): string {
    return getBreakIconLabel(this.current);
  }

  toggleOpen(): void {
    this.isOpen = !this.isOpen;
  }

  selectOption(id: BreakIconType): void {
    this.iconChange.emit(id);
    this.isOpen = false;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.isOpen && !this.elRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (this.isOpen && event.key === 'Escape') {
      this.isOpen = false;
    }
  }
}
