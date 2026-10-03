import { Module } from '@nestjs/common';
import { VendorOnboardingController } from './vendor-onboarding.controller';
import { VendorOnboardingService } from './vendor-onboarding.service';

/** PrismaService, MinioService and JwtAuthGuard come from global modules. */
@Module({
  controllers: [VendorOnboardingController],
  providers: [VendorOnboardingService],
})
export class VendorOnboardingModule {}
