import { Controller, Get, Post, Param, Body, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceiptsService, ImportSplit } from './receipts.service';
import { ReceiptFinderService } from '../transactions/receipt-finder.service';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private service: ReceiptsService,
    private receiptFinder: ReceiptFinderService,
  ) {}

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

  @Get(':id/transaction-candidates')
  transactionCandidates(
    @Param('id') id: string,
    @Query('window') window: string,
    @Request() req: any,
  ) {
    return this.receiptFinder.findTransactionCandidates(req.user.id, id, window ? parseInt(window, 10) : 4);
  }
}
