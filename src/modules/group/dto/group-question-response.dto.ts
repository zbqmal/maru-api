import { ApiProperty } from '@nestjs/swagger';
import { GroupQuestion } from '@prisma/client';

export class GroupQuestionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  groupId!: string;

  @ApiProperty()
  question!: string;

  @ApiProperty()
  displayOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdByUserId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export function toGroupQuestionResponseDto(
  question: GroupQuestion,
): GroupQuestionResponseDto {
  return {
    id: question.id,
    groupId: question.groupId,
    question: question.question,
    displayOrder: question.displayOrder,
    isActive: question.isActive,
    createdByUserId: question.createdByUserId,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}
