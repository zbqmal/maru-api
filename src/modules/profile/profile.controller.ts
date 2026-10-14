import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import {
  ProfileResponseDto,
  toProfileResponseDto,
} from './dto/profile-response.dto';
import { UpdateBirthdayDto } from './dto/update-birthday.dto';
import { UpdateNameDto } from './dto/update-name.dto';
import { RequestProfileImageUploadDto } from './dto/request-profile-image-upload.dto';
import { UpdateProfileImageDto } from './dto/update-profile-image.dto';
import { PresignedUploadResponseDto } from '../diary/dto/presigned-upload-response.dto';
import { ProfileService } from './profile.service';

@ApiTags('Profile')
@ApiCookieAuth('session')
@UseGuards(SessionAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @ApiOperation({ summary: 'Get own profile' })
  @ApiOkResponse({
    description: 'Current user profile',
    type: ProfileResponseDto,
  })
  @Get()
  getProfile(@CurrentUser() user: User): ProfileResponseDto {
    return toProfileResponseDto(this.profileService.getProfile(user));
  }

  @ApiOperation({ summary: 'Update display name' })
  @ApiOkResponse({ description: 'Updated profile', type: ProfileResponseDto })
  @HttpCode(200)
  @Patch('name')
  async updateName(
    @CurrentUser() user: User,
    @Body() dto: UpdateNameDto,
  ): Promise<ProfileResponseDto> {
    const updated = await this.profileService.updateName(user, dto.name);
    return toProfileResponseDto(updated);
  }

  @ApiOperation({ summary: 'Update birthday' })
  @ApiOkResponse({ description: 'Updated profile', type: ProfileResponseDto })
  @HttpCode(200)
  @Patch('birthday')
  async updateBirthday(
    @CurrentUser() user: User,
    @Body() dto: UpdateBirthdayDto,
  ): Promise<ProfileResponseDto> {
    const updated = await this.profileService.updateBirthday(
      user,
      dto.birthday,
    );
    return toProfileResponseDto(updated);
  }

  @ApiOperation({ summary: 'Request a presigned profile image upload URL' })
  @ApiCreatedResponse({
    description: 'Presigned profile image upload URL created successfully.',
    type: PresignedUploadResponseDto,
  })
  @Post('image/upload-url')
  createImageUpload(
    @CurrentUser() user: User,
    @Body() dto: RequestProfileImageUploadDto,
  ): Promise<PresignedUploadResponseDto> {
    return this.profileService.createImageUpload(user, dto);
  }

  @ApiOperation({ summary: 'Set own profile image' })
  @ApiOkResponse({ description: 'Updated profile', type: ProfileResponseDto })
  @Patch('image')
  async updateImage(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileImageDto,
  ): Promise<ProfileResponseDto> {
    return toProfileResponseDto(
      await this.profileService.updateImage(user, dto.storageKey, dto.mimeType),
    );
  }

  @ApiOperation({ summary: 'Remove own profile image' })
  @ApiNoContentResponse({ description: 'Profile image removed successfully.' })
  @HttpCode(204)
  @Delete('image')
  async removeImage(@CurrentUser() user: User): Promise<void> {
    await this.profileService.removeImage(user);
  }
}
