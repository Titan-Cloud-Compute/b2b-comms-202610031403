import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface NotificationPreferences {
  orderAlerts: boolean;
  messageAlerts: boolean;
  effectiveAt: Date | null;
}

export interface AlertItem {
  id: string;
  type: 'ORDER' | 'MESSAGE';
  body: string;
  createdAt: Date;
  orderId?: string;
  channelId?: string;
}

interface PrefRow {
  orderAlerts: boolean;
  messageAlerts: boolean;
  effectiveAt: Date;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  orderAlerts: true,
  messageAlerts: true,
  effectiveAt: null,
};

const FEED_LIMIT = 100;

/** The preference row in effect at `at` (last change at or before it), else defaults. */
export function preferenceAt(changes: PrefRow[], at: Date): { orderAlerts: boolean; messageAlerts: boolean } {
  let current: { orderAlerts: boolean; messageAlerts: boolean } = DEFAULT_PREFERENCES;
  for (const c of changes) {
    if (c.effectiveAt.getTime() <= at.getTime()) current = c;
    else break;
  }
  return current;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private history(userId: string): Promise<PrefRow[]> {
    return this.prisma.notificationPreferenceChange.findMany({
      where: { userId },
      orderBy: { effectiveAt: 'asc' },
      select: { orderAlerts: true, messageAlerts: true, effectiveAt: true },
    });
  }

  /** Current preferences for the user (defaults to both alerts on). */
  async get(userId: string): Promise<NotificationPreferences> {
    const latest = await this.prisma.notificationPreferenceChange.findFirst({
      where: { userId },
      orderBy: { effectiveAt: 'desc' },
      select: { orderAlerts: true, messageAlerts: true, effectiveAt: true },
    });
    return latest ?? { ...DEFAULT_PREFERENCES };
  }

  /** Appends a new effective-dated preference row; earlier alerts are unaffected. */
  async update(userId: string, input: { orderAlerts?: unknown; messageAlerts?: unknown }) {
    const current = await this.get(userId);
    const pick = (v: unknown, fallback: boolean, name: string): boolean => {
      if (v === undefined) return fallback;
      if (typeof v !== 'boolean') throw new BadRequestException(`${name} must be a boolean`);
      return v;
    };
    const orderAlerts = pick(input.orderAlerts, current.orderAlerts, 'orderAlerts');
    const messageAlerts = pick(input.messageAlerts, current.messageAlerts, 'messageAlerts');
    return this.prisma.notificationPreferenceChange.create({
      data: { userId, orderAlerts, messageAlerts, effectiveAt: new Date() },
      select: { orderAlerts: true, messageAlerts: true, effectiveAt: true },
    });
  }

  /** True when the user's current preference allows this kind of alert. */
  async allows(userId: string, type: 'ORDER' | 'MESSAGE'): Promise<boolean> {
    const p = await this.get(userId);
    return type === 'ORDER' ? p.orderAlerts : p.messageAlerts;
  }

  /** Keeps only order notifications the preference in effect at their time allowed. */
  async filterOrderNotifications<T extends { createdAt: Date }>(userId: string, rows: T[]): Promise<T[]> {
    const changes = await this.history(userId);
    return rows.filter((n) => preferenceAt(changes, n.createdAt).orderAlerts);
  }

  /**
   * Alerts feed: order notifications plus channel messages from others, each
   * kept only if the preference in effect at the event's time allowed it.
   */
  async feed(userId: string): Promise<AlertItem[]> {
    const [changes, orderNotes, memberships] = await Promise.all([
      this.history(userId),
      this.prisma.orderNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: FEED_LIMIT,
      }),
      this.prisma.channelMember.findMany({ where: { userId }, select: { channelId: true } }),
    ]);
    const channelIds = memberships.map((m) => m.channelId);
    const messages = channelIds.length
      ? await this.prisma.message.findMany({
          where: { channelId: { in: channelIds }, authorId: { not: userId } },
          orderBy: { createdAt: 'desc' },
          take: FEED_LIMIT,
        })
      : [];
    const items: AlertItem[] = [
      ...orderNotes
        .filter((n) => preferenceAt(changes, n.createdAt).orderAlerts)
        .map((n) => ({ id: n.id, type: 'ORDER' as const, body: n.body, createdAt: n.createdAt, orderId: n.orderId })),
      ...messages
        .filter((m) => preferenceAt(changes, m.createdAt).messageAlerts)
        .map((m) => ({ id: m.id, type: 'MESSAGE' as const, body: m.body, createdAt: m.createdAt, channelId: m.channelId })),
    ];
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return items.slice(0, FEED_LIMIT);
  }
}
