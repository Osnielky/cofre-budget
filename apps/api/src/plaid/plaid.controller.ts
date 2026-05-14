import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaidService } from './plaid.service';

@UseGuards(JwtAuthGuard)
@Controller('plaid')
export class PlaidController {
  constructor(private service: PlaidService) {}

  @Post('link-token')
  async createLinkToken(@Request() req: any) {
    const linkToken = await this.service.createLinkToken(req.user.id);
    return { link_token: linkToken };
  }

  @Post('exchange')
  exchange(
    @Request() req: any,
    @Body() body: { public_token: string; institution_id: string; institution_name: string },
  ) {
    return this.service.exchangeToken(
      req.user.id,
      body.public_token,
      body.institution_id,
      body.institution_name,
    );
  }

  @Post('sync/:itemId')
  sync(@Param('itemId') itemId: string, @Request() req: any) {
    return this.service.syncItem(itemId, req.user.id);
  }
}
