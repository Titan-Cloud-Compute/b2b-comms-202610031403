import { Controller, Get, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InvoiceCaller, InvoiceGenerationService } from './invoice-generation.service';

function callerOf(req: Request): InvoiceCaller {
  if (!req.session) throw new UnauthorizedException('not authenticated');
  return { userId: req.session.userId, role: req.session.role };
}

@ApiTags('invoices')
@UseGuards(JwtAuthGuard)
@Controller('api')
export class InvoiceGenerationController {
  constructor(private readonly invoices: InvoiceGenerationService) {}

  @Get('invoices')
  list(@Req() req: Request) {
    return this.invoices.list(callerOf(req));
  }

  @Post('vendor/orders/:id/invoice')
  generate(@Req() req: Request, @Param('id') id: string) {
    return this.invoices.generate(callerOf(req), id);
  }

  @Get('orders/:id/invoice')
  forOrder(@Req() req: Request, @Param('id') id: string) {
    return this.invoices.forOrder(callerOf(req), id);
  }

  @Get('orders/:id/invoice/download')
  async download(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const { filename, body } = await this.invoices.pdf(callerOf(req), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(body.length));
    res.end(body);
  }
}
