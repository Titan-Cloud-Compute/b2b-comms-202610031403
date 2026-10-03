/**
 * Feature module registry.
 *
 * Each story appends its NestJS module to this array.
 * AppModule spreads FEATURE_MODULES so new features are picked up automatically.
 *
 * Example (in features/my-feature/my-feature.module.ts):
 *
 *   import { FEATURE_MODULES } from '../index';
 *   FEATURE_MODULES.push(MyFeatureModule);
 *
 * Or simply add it here directly.
 */
import { VendorOnboardingModule } from './vendor-onboarding/vendor-onboarding.module';
import { SharedChannelModule } from './shared-channel/shared-channel.module';
import { OrderManagementModule } from './order-management/order-management.module';
import { CustomerInviteModule } from './customer-invite/customer-invite.module';
import { InvoiceGenerationModule } from './invoice-generation/invoice-generation.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FEATURE_MODULES: any[] = [
  VendorOnboardingModule,
  SharedChannelModule,
  OrderManagementModule,
  CustomerInviteModule,
  InvoiceGenerationModule,
  NotificationPreferencesModule,
];
