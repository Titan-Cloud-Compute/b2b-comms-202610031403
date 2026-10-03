import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { VendorOnboardingService } from './vendor-onboarding.service';
import type { UploadedVendorFile } from './vendor-onboarding.service';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Controller('api/vendor')
@UseGuards(JwtAuthGuard)
export class VendorOnboardingController {
  constructor(private readonly vendor: VendorOnboardingService) {}

  @Get('profile')
  getProfile(@Req() req: Request) {
    return this.vendor.getProfile(req.session!.userId);
  }

  @Put('profile')
  putProfile(@Req() req: Request, @Body() body: unknown) {
    return this.vendor.upsertProfile(req.session!.userId, body);
  }

  @Get('documents')
  listDocuments(@Req() req: Request) {
    return this.vendor.listDocuments(req.session!.userId);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadDocument(
    @Req() req: Request,
    @UploadedFile() file: UploadedVendorFile | undefined,
    @Body() body: { type?: string } | undefined,
  ) {
    return this.vendor.uploadDocument(req.session!.userId, file, body?.type);
  }
}
