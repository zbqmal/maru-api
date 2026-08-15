import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { PasswordResetService } from './services/password-reset.service';
import { SessionService } from './services/session.service';
import { SessionTokenService } from './services/session-token.service';
import { PasswordHashingService } from './services/password-hashing.service';
import { SessionTokenCleanupService } from './services/session-token-cleanup.service';

@Module({
  imports: [DatabaseModule, EmailModule, UserModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashingService,
    PasswordResetService,
    SessionAuthGuard,
    SessionTokenService,
    SessionService,
    SessionTokenCleanupService,
  ],
  exports: [
    AuthService,
    PasswordHashingService,
    PasswordResetService,
    SessionTokenService,
    SessionService,
    SessionTokenCleanupService,
  ],
})
export class AuthModule {}
