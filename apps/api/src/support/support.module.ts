import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';

/** Problem reports (support tickets): user routes here, admin routes in AdminModule. */
@Module({
  imports: [MailModule],
  providers: [SupportService],
  controllers: [SupportController],
  exports: [SupportService],
})
export class SupportModule {}
