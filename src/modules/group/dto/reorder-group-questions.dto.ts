import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
} from 'class-validator';

export class ReorderGroupQuestionsDto {
  @ApiProperty({
    description:
      'Complete ordered list of group question IDs in their new display order',
    example: ['cq_1', 'cq_2'],
    isArray: true,
    maxItems: 4,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  questionIds!: string[];
}
