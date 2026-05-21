import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DataResetService, ResetOptions } from './data-reset.service';

@UseGuards(JwtAuthGuard)
@Controller('data-reset')
export class DataResetController {
  constructor(private service: DataResetService) {}

  @Post('preview')
  preview(@Request() req: any, @Body() body: ResetOptions) {
    return this.service.preview(req.user.id, body);
  }

  @Post()
  reset(@Request() req: any, @Body() body: ResetOptions) {
    return this.service.reset(req.user.id, body);
  }
}
