import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminJwtGuard } from './admin-jwt.guard';
import { DemoModule } from '../demo/demo.module';

@Module({
  imports: [DemoModule],
  providers: [AdminService, AdminGuard, AdminJwtGuard],
  controllers: [AdminController],
})
export class AdminModule {}
