import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class InvitationTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  token!: string;
}
