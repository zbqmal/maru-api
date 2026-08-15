import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ResendEmailProvider } from './resend-email.provider';
import { EMAIL_PROVIDER } from './types/email.types';

@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: ResendEmailProvider,
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
