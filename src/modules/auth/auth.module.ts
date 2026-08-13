import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SessionService } from './services/session.service';
import { SessionTokenService } from './services/session-token.service';
import { PasswordHashingService } from './services/password-hashing.service';

@Module({
  imports: [DatabaseModule],
  providers: [PasswordHashingService, SessionTokenService, SessionService],
  exports: [PasswordHashingService, SessionTokenService, SessionService],
})
export class AuthModule {}
