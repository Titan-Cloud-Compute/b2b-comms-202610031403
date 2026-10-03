import { Module } from '@nestjs/common';
import { InvoiceGenerationController } from './invoice-generation.controller';
import { InvoiceGenerationService } from './invoice-generation.service';

/** Story: invoice-generation. PrismaService and JwtAuthGuard come from global modules. */
@Module({
  controllers: [InvoiceGenerationController],
  providers: [InvoiceGenerationService],
})
export class InvoiceGenerationModule {}
