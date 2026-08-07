import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CategorizationRulesService } from './categorization-rules.service';

@UseGuards(JwtAuthGuard)
@Controller('categorization-rules')
export class CategorizationRulesController {
  constructor(private service: CategorizationRulesService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() body: { transactionId: string; categoryId: string }) {
    return this.service.create(req.user.id, body.transactionId, body.categoryId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() body: { matchValue?: string; categoryId?: string }) {
    return this.service.update(id, req.user.id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.id);
  }
}
