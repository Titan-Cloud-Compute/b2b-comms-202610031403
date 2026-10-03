import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Caller, OrderManagementService } from './order-management.service';

function callerOf(req: Request): Caller {
  if (!req.session) throw new UnauthorizedException('not authenticated');
  return { userId: req.session.userId, role: req.session.role };
}

@ApiTags('orders')
@UseGuards(JwtAuthGuard)
@Controller('api')
export class OrderManagementController {
  constructor(private readonly orders: OrderManagementService) {}

  @Get('vendors')
  vendors(@Req() req: Request) {
    callerOf(req);
    return this.orders.listVendors();
  }

  @Get('vendors/:id/products')
  catalog(@Req() req: Request, @Param('id') id: string) {
    callerOf(req);
    return this.orders.listCatalog(id);
  }

  @Get('vendor/products')
  ownProducts(@Req() req: Request) {
    return this.orders.listOwnProducts(callerOf(req));
  }

  @Post('vendor/products')
  createProduct(
    @Req() req: Request,
    @Body() body: { name?: unknown; description?: unknown; unitPriceCents?: unknown },
  ) {
    return this.orders.createProduct(callerOf(req), body ?? {});
  }

  @Get('vendor/orders')
  vendorOrders(@Req() req: Request, @Query('status') status?: string) {
    return this.orders.listVendorOrders(callerOf(req), status);
  }

  @Get('orders')
  myOrders(@Req() req: Request) {
    return this.orders.listCustomerOrders(callerOf(req));
  }

  @Get('orders/notifications')
  notifications(@Req() req: Request) {
    return this.orders.listNotifications(callerOf(req));
  }

  @Post('orders')
  create(@Req() req: Request, @Body() body: { vendorId?: unknown; items?: unknown }) {
    return this.orders.createOrder(callerOf(req), body ?? {});
  }

  @Patch('orders/:id/confirm')
  confirm(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { estimatedDeliveryDate?: unknown },
  ) {
    return this.orders.confirmOrder(callerOf(req), id, body ?? {});
  }
}
