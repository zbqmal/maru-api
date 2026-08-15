import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';

export class UpdateBirthdayDto {
  @ApiProperty({
    example: '1990-05-20',
    nullable: true,
    type: String,
    format: 'date',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? null : value,
  )
  @IsOptional()
  @IsDateString()
  birthday!: string | null;
}
