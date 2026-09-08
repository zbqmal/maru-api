import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { MediaModule } from '../media/media.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [UserModule, AuthModule, MediaModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
