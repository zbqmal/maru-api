import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SessionService } from './services/session.service';
import { SessionTokenService } from './services/session-token.service';
import { PasswordHashingService } from './services/password-hashing.service';

@Module({
  imports: [DatabaseModule, UserModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashingService,
    SessionAuthGuard,
    SessionTokenService,
    SessionService,
  ],
  exports: [
    AuthService,
    PasswordHashingService,
    SessionTokenService,
    SessionService,
  ],
})
export class AuthModule {}
