import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request, HttpCode, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { UpsertCategoryDto } from './dto/upsert-category.dto';
import { MergeCategoryDto } from './dto/merge-category.dto';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: UpsertCategoryDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() dto: UpsertCategoryDto) {
    return this.service.update(id, req.user.id, dto);
  }

  @Get(':id/usage')
  usage(@Param('id') id: string, @Request() req: any) {
    return this.service.getUsageCount(id, req.user.id);
  }

  /** Fold :id into body.targetId (optionally renaming the target); :id is deleted. */
  @Post(':id/merge')
  @HttpCode(200)
  merge(@Param('id') id: string, @Request() req: any, @Body() dto: MergeCategoryDto) {
    return this.service.merge(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Request() req: any, @Query('reassignTo') reassignTo?: string) {
    return this.service.remove(id, req.user.id, reassignTo);
  }
}
