import { Controller, Get, Post, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceiptsService, ImportSplit } from './receipts.service';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(private service: ReceiptsService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.syncAndFind(req.user.id);
  }

  @Post(':id/import')
  import(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { splits: ImportSplit[] },
  ) {
    return this.service.importToTransactions(id, req.user.id, body.splits);
  }
}
