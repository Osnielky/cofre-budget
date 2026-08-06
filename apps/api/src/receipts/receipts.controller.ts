import { Controller, Get, Post, Patch, Param, Body, Query, Request, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceiptsService, ImportSplit, CreateManualReceiptInput } from './receipts.service';
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

  @Post('manual')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
      if (!allowed.includes(file.mimetype)) return cb(new BadRequestException('Unsupported file type'), false);
      cb(null, true);
    },
  }))
  uploadManual(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { merchant: string; total: string; currency?: string; orderDate?: string; orderNumber?: string; items?: string },
  ) {
    if (!body.merchant?.trim()) throw new BadRequestException('merchant is required');
    const total = Number(body.total);
    if (!Number.isFinite(total) || total <= 0) throw new BadRequestException('total must be a positive number');

    let items: CreateManualReceiptInput['items'] = [];
    if (body.items) {
      try {
        const parsed = JSON.parse(body.items);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        throw new BadRequestException('items must be valid JSON');
      }
    }

    const input: CreateManualReceiptInput = {
      merchant: body.merchant.trim(),
      total,
      currency: body.currency || 'USD',
      orderDate: body.orderDate || null,
      orderNumber: body.orderNumber || null,
      items,
    };
    return this.service.createManual(req.user.id, input, file);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Request() req: any) {
    return this.service.approve(req.user.id, id);
  }

  @Get(':id/image')
  async image(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const img = await this.service.getImage(req.user.id, id);
    if (!img) throw new NotFoundException();
    res.set('Content-Type', img.mimeType);
    res.send(img.data);
  }
}
