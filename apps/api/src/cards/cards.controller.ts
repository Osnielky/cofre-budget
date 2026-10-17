import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditCardsService } from './credit-cards.service';

/* Card data is available on every plan; only the advisor (Ask Cofre) is metered. */
@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private service: CreditCardsService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.listForUser(req.user.id);
  }

  @Get('debit')
  listDebit(@Request() req: any) {
    return this.service.listDebitForUser(req.user.id);
  }

  @Get('profile')
  getProfile(@Request() req: any) {
    return this.service.getProfile(req.user.id);
  }

  @Put('profile')
  saveProfile(@Request() req: any, @Body() body: unknown) {
    return this.service.saveProfile(req.user.id, body);
  }

  @Patch(':accountId')
  update(@Param('accountId', ParseUUIDPipe) accountId: string, @Request() req: any, @Body() body: unknown) {
    return this.service.updateDetail(req.user.id, accountId, body);
  }

  @Post(':accountId/use-bank-data')
  useBankData(@Param('accountId', ParseUUIDPipe) accountId: string, @Request() req: any) {
    return this.service.useBankData(req.user.id, accountId);
  }
}
