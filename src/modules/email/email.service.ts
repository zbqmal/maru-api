import { Inject, Injectable } from '@nestjs/common';
import type { EmailProvider } from './types/email.types';
import { EMAIL_PROVIDER } from './types/email.types';
import type { SendEmailOptions } from './types/email.types';

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  send(options: SendEmailOptions): Promise<void> {
    return this.provider.send(options);
  }
}
