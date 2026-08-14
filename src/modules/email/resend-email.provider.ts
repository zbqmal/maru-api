import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EnvironmentVariables } from '../../common/config/environment.variables';
import { EmailProvider, SendEmailOptions } from './types/email.types';

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly resend: Resend;
  private readonly fromAddress: string;
  private readonly logger = new Logger(ResendEmailProvider.name);

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.resend = new Resend(this.configService.get('RESEND_API_KEY'));
    this.fromAddress = this.configService.get('EMAIL_FROM');
  }

  async send(options: SendEmailOptions): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      this.logger.error(
        `Failed to send email to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}: ${error.message}`,
      );
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }
}
