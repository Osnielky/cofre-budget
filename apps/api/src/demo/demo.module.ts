import { Module, forwardRef } from '@nestjs/common';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';
import { AuthModule } from '../auth/auth.module';

/** Demo data: the permanent Rockefeller account and throwaway visitor sandboxes. */
@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [DemoService],
  controllers: [DemoController],
  exports: [DemoService],
})
export class DemoModule {}
