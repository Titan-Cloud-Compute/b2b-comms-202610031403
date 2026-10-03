import { Module } from '@nestjs/common';
import { NotificationPreferencesModule } from '../notification-preferences/notification-preferences.module';
import { SharedChannelModule } from '../shared-channel/shared-channel.module';
import { OrderManagementController } from './order-management.controller';
import { OrderManagementService } from './order-management.service';

/** PrismaService, AuditService and JwtAuthGuard come from global modules. */
@Module({
  imports: [SharedChannelModule, NotificationPreferencesModule],
  controllers: [OrderManagementController],
  providers: [OrderManagementService],
})
export class OrderManagementModule {}
