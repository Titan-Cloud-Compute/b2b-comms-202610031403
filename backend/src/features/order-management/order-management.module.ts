import { Module } from '@nestjs/common';
import { SharedChannelModule } from '../shared-channel/shared-channel.module';
import { OrderManagementController } from './order-management.controller';
import { OrderManagementService } from './order-management.service';

/** PrismaService, AuditService and JwtAuthGuard come from global modules. */
@Module({
  imports: [SharedChannelModule],
  controllers: [OrderManagementController],
  providers: [OrderManagementService],
})
export class OrderManagementModule {}
