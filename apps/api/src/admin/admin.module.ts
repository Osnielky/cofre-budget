import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

@Module({
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
})
export class AdminModule {}
