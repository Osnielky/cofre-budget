import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectsService, ProjectDto, ProjectCategoryDto } from './projects.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private service: ProjectsService) {}

  @Get()
  list(@Request() req: any) {
    return this.service.findAllByUser(req.user.id);
  }

  /* ── Type-level category management (settings page, no project ID needed) ── */

  @Get('type-categories')
  listTypeCategories(@Query('type') type: string, @Request() req: any) {
    return this.service.loadTypeCategories(req.user.id, type ?? 'other');
  }

  @Post('type-categories/seed')
  seedTypeCategories(@Body() body: { type: string }, @Request() req: any) {
    return this.service.seedForType(body.type ?? 'other', req.user.id);
  }

  /* `projectType` names the project family (vehicle/property/…); `type` is the
     category's own expense|income. They used to share the key `type`, so a
     create silently dropped expense|income and defaulted every new category to
     expense. `type` is still accepted as the project family when projectType is
     absent, so a stale client mid-deploy keeps working. */
  @Post('type-categories')
  createTypeCategory(
    @Body() dto: ProjectCategoryDto & { projectType?: string; type?: string },
    @Request() req: any,
  ) {
    const { projectType, ...rest } = dto;
    if (projectType) {
      return this.service.createCategoryForType(projectType, req.user.id, rest);
    }
    const { type, ...legacy } = rest;
    return this.service.createCategoryForType(type ?? 'other', req.user.id, legacy);
  }

  @Patch('type-categories/:catId')
  updateTypeCategory(@Param('catId') catId: string, @Request() req: any, @Body() dto: Partial<ProjectCategoryDto>) {
    return this.service.updateCategoryById(catId, req.user.id, dto);
  }

  @Delete('type-categories/:catId')
  deleteTypeCategory(@Param('catId') catId: string, @Request() req: any) {
    return this.service.deleteCategoryById(catId, req.user.id);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: ProjectDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id/purchase-tx')
  setPurchaseTx(
    @Param('id') id: string,
    @Request() req: any,
    @Body('transactionId') transactionId: string | null,
  ) {
    return this.service.setPurchaseTx(id, req.user.id, transactionId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() dto: Partial<ProjectDto>) {
    return this.service.update(id, req.user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.id);
  }

  /* ── Transaction link/unlink ── */

  @Patch(':id/link/:txId')
  linkTx(
    @Param('id') id: string,
    @Param('txId') txId: string,
    @Request() req: any,
    @Body() body: { projectCategoryId?: string },
  ) {
    return this.service.linkTransaction(id, txId, req.user.id, body.projectCategoryId);
  }

  @Patch(':id/unlink/:txId')
  unlinkTx(@Param('id') id: string, @Param('txId') txId: string, @Request() req: any) {
    return this.service.unlinkTransaction(txId, req.user.id);
  }

  @Patch(':id/tx/:txId/category')
  assignTxCategory(
    @Param('txId') txId: string,
    @Request() req: any,
    @Body() body: { projectCategoryId: string | null },
  ) {
    return this.service.assignCategory(txId, body.projectCategoryId, req.user.id);
  }

  /* ── Project categories CRUD ── */

  @Get(':id/categories')
  listCategories(@Param('id') id: string, @Request() req: any) {
    return this.service.getCategories(id, req.user.id);
  }

  @Post(':id/categories/seed')
  seedCategories(@Param('id') id: string, @Request() req: any) {
    return this.service.seedDefaultCategories(id, req.user.id);
  }

  @Post(':id/categories')
  createCategory(@Param('id') id: string, @Request() req: any, @Body() dto: ProjectCategoryDto) {
    return this.service.createCategory(id, req.user.id, dto);
  }

  @Patch(':id/categories/:catId')
  updateCategory(
    @Param('id') id: string,
    @Param('catId') catId: string,
    @Request() req: any,
    @Body() dto: Partial<ProjectCategoryDto>,
  ) {
    return this.service.updateCategory(id, catId, req.user.id, dto);
  }

  @Delete(':id/categories/:catId')
  deleteCategory(@Param('id') id: string, @Param('catId') catId: string, @Request() req: any) {
    return this.service.deleteCategory(id, catId, req.user.id);
  }
}
