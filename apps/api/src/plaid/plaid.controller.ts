import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { PlaidService } from './plaid.service';

@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('pro')
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

  @Post('reconnect-token/:itemId')
  async createReconnectLinkToken(@Param('itemId') itemId: string, @Request() req: any) {
    const linkToken = await this.service.createReconnectLinkToken(req.user.id, itemId);
    return { link_token: linkToken };
  }

  @Post('reconnect/:itemId/complete')
  async completeReconnect(@Param('itemId') itemId: string, @Request() req: any) {
    await this.service.completeReconnect(itemId, req.user.id);
    return { status: 'active' };
  }
}
