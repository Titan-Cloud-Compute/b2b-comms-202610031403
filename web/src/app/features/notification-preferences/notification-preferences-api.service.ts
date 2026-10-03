import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NotificationPreferencesView {
  orderAlerts: boolean;
  messageAlerts: boolean;
  effectiveAt: string | null;
}

export interface AlertView {
  id: string;
  type: 'ORDER' | 'MESSAGE';
  body: string;
  createdAt: string;
  orderId?: string;
  channelId?: string;
}

/** Relative base so the browser resolves it against the document base href. */
const API = 'api';
const opts = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class NotificationPreferencesApi {
  private readonly http = inject(HttpClient);

  get(): Observable<NotificationPreferencesView> {
    return this.http.get<NotificationPreferencesView>(`${API}/notification-preferences`, opts);
  }

  save(prefs: { orderAlerts: boolean; messageAlerts: boolean }): Observable<NotificationPreferencesView> {
    return this.http.put<NotificationPreferencesView>(`${API}/notification-preferences`, prefs, opts);
  }

  alerts(): Observable<AlertView[]> {
    return this.http.get<AlertView[]>(`${API}/notifications`, opts);
  }
}
