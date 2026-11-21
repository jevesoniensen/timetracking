import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { UploadPreviewResponse } from '../../types';
import uploadIcon from '../../assets/icons/upload.svg';
import cloudUploadIcon from '../../assets/icons/cloud-upload.svg';
import checkCircleIcon from '../../assets/icons/check-circle.svg';
import template from '../html/UploadModal.html?raw';

export type UploadMode = 'events' | 'overrides';

@Component({
  selector: 'app-upload-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template,
})
export class UploadModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() initialMode: UploadMode = 'events';
  @Input() isLoading = false;
  @Input() onUpload?: (content: string, clearAll: boolean, mode: UploadMode) => Promise<void>;
  @Output() closeModal = new EventEmitter<void>();

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  mode: UploadMode = 'events';
  fileContent = '';
  fileName = '';
  clearAll = false;
  isDragging = false;
  error: string | null = null;
  parsedPreview: UploadPreviewResponse | null = null;

  readonly uploadIcon = uploadIcon;
  readonly cloudUploadIcon = cloudUploadIcon;
  readonly checkCircleIcon = checkCircleIcon;

  readonly overridesFormatSample = `2026-09-03|17:00:00|18:20:00
OVERRIDE_IN|2026-09-09|07:49:05
OVERRIDE_OUT|2026-09-09|17:18:00
VACATION|2026-09-15
VACATION|2026-09-21|2026-09-25`;

  readonly eventsFormatSample = `STARTUP|2026-07-07 17:20:04
SHUTDOWN|2026-07-07 17:27:35
STARTUP|2026-07-08 06:45:43
SHUTDOWN|2026-07-08 18:55:02`;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.mode = this.initialMode;
      this.error = null;
    }
  }

  setMode(nextMode: UploadMode): void {
    this.mode = nextMode;
    this.error = null;
    this.refreshPreview();
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = true;
  }

  handleDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      this.handleFileChange(e.dataTransfer.files[0]);
    }
  }

  onFileInputChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.handleFileChange(input.files[0]);
    }
  }

  handleFileChange(file: File): void {
    this.error = null;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        this.fileContent = text;
        this.refreshPreview();
      }
    };
    reader.onerror = () => {
      this.error = 'Failed to read file. Please try again.';
    };
    reader.readAsText(file);
  }

  refreshPreview(): void {
    if (!this.fileContent.trim()) {
      this.parsedPreview = null;
      return;
    }
    fetch(`/api/upload/preview?mode=${this.mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: this.fileContent,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UploadPreviewResponse | null) => {
        if (!data) return;
        this.parsedPreview = data;
        if (data.kind && data.kind !== this.mode && data.totalCount > 0) {
          this.mode = data.kind;
        }
      })
      .catch(() => {
        this.parsedPreview = null;
      });
  }

  async handleSubmit(): Promise<void> {
    if (!this.fileContent.trim()) {
      this.error = 'Please choose a file first.';
      return;
    }
    if (this.parsedPreview && this.parsedPreview.totalCount === 0) {
      this.error =
        this.mode === 'overrides'
          ? 'No valid overrides found. Expected OVERRIDE_IN|date|time, OVERRIDE_OUT|date|time, or date|start|end.'
          : 'No valid events found. Expected format: STARTUP|YYYY-MM-DD HH:mm:ss';
      return;
    }

    try {
      if (this.onUpload) {
        await this.onUpload(this.fileContent, this.clearAll, this.mode);
      }
      this.closeModal.emit();
      this.fileContent = '';
      this.fileName = '';
      this.parsedPreview = null;
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Upload failed';
    }
  }
}
