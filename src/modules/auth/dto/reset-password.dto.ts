import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The password reset token received by email' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'NewStr0ngPassword!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
