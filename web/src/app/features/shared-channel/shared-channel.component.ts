import { Component, OnDestroy, OnInit, NgZone, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../shared/auth.service';

export interface ChannelMemberView {
  userId: string;
  role: 'VENDOR' | 'CUSTOMER';
  name: string | null;
  email: string;
}

export interface ChannelView {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  members: ChannelMemberView[];
}

export interface CustomerOption {
  id: string;
  name: string | null;
  email: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

/** Relative base so the browser resolves it against the document base href. */
const API = 'api/channels';

@Component({
  selector: 'app-shared-channel',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="channels-page">
      <header class="page-header">
        <h1>Shared channels</h1>
      </header>

      @if (isVendor()) {
        <form class="create-form" data-testid="create-channel-form" (ngSubmit)="createChannel()">
          <h2>New shared channel</h2>
          <label for="channel-name">Channel name</label>
          <input id="channel-name" name="channelName" [(ngModel)]="newName" required data-testid="channel-name-input" />
          <fieldset>
            <legend>Customers</legend>
            @for (c of customers(); track c.id) {
              <label class="customer-option">
                <input type="checkbox" [checked]="selected().has(c.id)" (change)="toggleCustomer(c.id)" [attr.data-testid]="'customer-option-' + c.id" />
                {{ c.name || c.email }}
              </label>
            } @empty {
              <p class="muted">No customers yet.</p>
            }
          </fieldset>
          <button type="submit" class="btn-primary" [disabled]="!newName.trim() || selected().size === 0 || busy()" data-testid="create-channel-submit">Create channel</button>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        </form>
      }

      <div class="layout">
        <ul class="channel-list" data-testid="channel-list">
          @for (ch of channels(); track ch.id) {
            <li>
              <button type="button" [class.active]="ch.id === activeId()" (click)="openChannel(ch.id)" [attr.data-testid]="'channel-item-' + ch.id">
                {{ ch.name }}
              </button>
            </li>
          } @empty {
            <li class="muted">No channels yet.</li>
          }
        </ul>

        @if (activeChannel(); as ch) {
          <section class="thread" data-testid="channel-thread">
            <h2>{{ ch.name }}</h2>
            <ul class="messages" data-testid="message-list">
              @for (m of messages(); track m.id) {
                <li data-testid="message-item">
                  <strong>{{ m.authorName }}</strong>
                  <span class="muted">{{ m.createdAt | date: 'short' }}</span>
                  <p>{{ m.body }}</p>
                </li>
              } @empty {
                <li class="muted">No messages yet.</li>
              }
            </ul>
            <form class="composer" (ngSubmit)="sendMessage()" data-testid="message-composer">
              <input name="draft" [(ngModel)]="draft" placeholder="Write a message…" data-testid="message-input" />
              <button type="submit" class="btn-primary" [disabled]="!draft.trim()" data-testid="message-send">Send</button>
            </form>
          </section>
        }
      </div>
    </div>
  `,
  styles: [`
    .channels-page { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; }
    .layout { display: flex; gap: 1.5rem; align-items: flex-start; }
    .channel-list { list-style: none; padding: 0; min-width: 220px; }
    .channel-list button { width: 100%; text-align: left; }
    .channel-list button.active { font-weight: bold; }
    .thread { flex: 1; }
    .messages { list-style: none; padding: 0; }
    .composer { display: flex; gap: 0.5rem; }
    .composer input { flex: 1; }
    .create-form { margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .customer-option { display: block; }
  `],
})
export class SharedChannelComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private source: EventSource | null = null;

  readonly channels = signal<ChannelView[]>([]);
  readonly customers = signal<CustomerOption[]>([]);
  readonly messages = signal<ChannelMessage[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly activeId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly isVendor = computed(() => this.auth.hasRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'));
  readonly activeChannel = computed(
    () => this.channels().find((c) => c.id === this.activeId()) ?? null,
  );

  newName = '';
  draft = '';

  ngOnInit(): void {
    this.loadChannels();
    if (this.isVendor()) {
      this.http.get<CustomerOption[]>(`${API}/customers`, { withCredentials: true }).subscribe({
        next: (list) => this.customers.set(Array.isArray(list) ? list : []),
        error: () => this.customers.set([]),
      });
    }
  }

  ngOnDestroy(): void {
    this.closeStream();
  }

  loadChannels(): void {
    this.http.get<ChannelView[]>(API, { withCredentials: true }).subscribe({
      next: (list) => this.channels.set(Array.isArray(list) ? list : []),
      error: () => this.channels.set([]),
    });
  }

  toggleCustomer(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  createChannel(): void {
    const name = this.newName.trim();
    if (!name || this.selected().size === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.http
      .post<{ id: string }>(API, { name, customerIds: [...this.selected()] }, { withCredentials: true })
      .subscribe({
        next: (ch) => {
          this.busy.set(false);
          this.newName = '';
          this.selected.set(new Set());
          this.loadChannels();
          if (ch?.id) this.openChannel(ch.id);
        },
        error: () => {
          this.busy.set(false);
          this.error.set('Could not create the channel.');
        },
      });
  }

  openChannel(id: string): void {
    this.activeId.set(id);
    this.messages.set([]);
    this.http.get<ChannelMessage[]>(`${API}/${encodeURIComponent(id)}/messages`, { withCredentials: true }).subscribe({
      next: (list) => this.mergeMessages(Array.isArray(list) ? list : []),
      error: () => this.messages.set([]),
    });
    this.openStream(id);
  }

  sendMessage(): void {
    const id = this.activeId();
    const body = this.draft.trim();
    if (!id || !body) return;
    this.http
      .post<ChannelMessage>(`${API}/${encodeURIComponent(id)}/messages`, { body }, { withCredentials: true })
      .subscribe({
        next: (m) => {
          this.draft = '';
          if (m && m.id) this.mergeMessages([m]);
        },
      });
  }

  private mergeMessages(incoming: ChannelMessage[]): void {
    const byId = new Map(this.messages().map((m) => [m.id, m]));
    for (const m of incoming) {
      if (m.channelId === this.activeId()) byId.set(m.id, m);
    }
    this.messages.set(
      [...byId.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    );
  }

  private openStream(id: string): void {
    this.closeStream();
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(`${API}/${encodeURIComponent(id)}/stream`, { withCredentials: true });
    es.onmessage = (evt: MessageEvent<string>) => {
      try {
        const m = JSON.parse(evt.data) as ChannelMessage;
        this.zone.run(() => this.mergeMessages([m]));
      } catch {
        /* ignore malformed frames */
      }
    };
    this.source = es;
  }

  private closeStream(): void {
    this.source?.close();
    this.source = null;
  }
}
