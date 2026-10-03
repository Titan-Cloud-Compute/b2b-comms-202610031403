import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VendorOnboardingApi } from './vendor-onboarding-api.service';
import { VENDOR_STYLES } from './vendor-onboarding.styles';
import { vendorDocumentStatusLabel, type VendorDocumentDto } from './vendor-onboarding.types';

@Component({
  selector: 'app-vendor-documents',
  standalone: true,
  imports: [RouterLink],
  styles: [VENDOR_STYLES],
  template: `
    <section class="vendor-page">
      <h1>Compliance documents</h1>
      @if (!profileComplete()) {
        <p class="hint" data-testid="vendor-documents-profile-required">
          Complete your <a routerLink="/vendor/onboarding">vendor profile</a> before uploading documents.
        </p>
      }
      <form class="vendor-card" data-testid="vendor-document-upload" (submit)="$event.preventDefault(); upload()">
        <div class="vendor-field">
          <label for="documentType">Document type</label>
          <select id="documentType" name="documentType" [value]="docType()" (change)="docType.set($any($event.target).value)">
            <option value="compliance">Compliance certificate</option>
            <option value="insurance">Insurance certificate</option>
            <option value="tax">Tax form</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="vendor-field">
          <label for="documentFile">File</label>
          <input id="documentFile" name="documentFile" type="file" (change)="onFile($event)" />
        </div>
        @if (error()) { <p class="vendor-error" role="alert">{{ error() }}</p> }
        <button class="vendor-btn" type="submit" data-testid="vendor-document-upload-submit"
                [disabled]="!file() || uploading() || !profileComplete()">
          {{ uploading() ? 'Uploading…' : 'Upload document' }}
        </button>
      </form>
      <div class="vendor-card" data-testid="vendor-document-library">
        <h2>Document library</h2>
        @if (documents().length === 0) {
          <p class="hint">No documents uploaded yet.</p>
        } @else {
          <ul class="vendor-doc-list">
            @for (d of documents(); track d.id) {
              <li data-testid="vendor-document-row">
                <span>{{ d.name }}</span>
                <span class="vendor-badge" data-testid="vendor-document-status">{{ statusLabel(d.status) }}</span>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
})
export class VendorDocumentsComponent implements OnInit {
  private api = inject(VendorOnboardingApi);

  documents = signal<VendorDocumentDto[]>([]);
  file = signal<File | null>(null);
  docType = signal('compliance');
  uploading = signal(false);
  profileComplete = signal(false);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const p = await this.api.getProfile();
      this.profileComplete.set(!!p?.completed);
    } catch {
      this.profileComplete.set(false);
    }
    await this.refresh();
  }

  statusLabel(status: string): string {
    return vendorDocumentStatusLabel(status);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  async upload(): Promise<void> {
    const f = this.file();
    if (!f) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const doc = await this.api.uploadDocument(f, this.docType());
      this.documents.update((rows) => [doc, ...rows.filter((r) => r.id !== doc.id)]);
      this.file.set(null);
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'Upload failed. Please try again.');
    } finally {
      this.uploading.set(false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      this.documents.set(await this.api.listDocuments());
    } catch {
      this.documents.set([]);
    }
  }
}
