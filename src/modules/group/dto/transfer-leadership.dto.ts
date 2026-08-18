import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class TransferLeadershipDto {
  @ApiProperty({ description: 'User ID of the member to promote to leader' })
  @IsString()
  @IsNotEmpty()
  newLeaderId!: string;
}
