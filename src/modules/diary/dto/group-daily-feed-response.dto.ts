import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Answer, DiaryEntry, GroupMember, Photo, User } from '@prisma/client';
import { AnswerResponseDto, toAnswerResponseDto } from './answer-response.dto';
import { PhotoResponseDto, toPhotoResponseDto } from './photo-response.dto';

type UserSummary = Pick<User, 'id' | 'name' | 'profileImageKey'>;
type MembershipWithUserAndEntry = GroupMember & {
  user: UserSummary;
  entry: (DiaryEntry & { answers: Answer[]; photos: Photo[] }) | null;
};

export class FeedMemberUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  profileImageKey!: string | null;
}

export class FeedEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'ISO-8601 date string (date only)' })
  diaryDate!: string;

  @ApiProperty({ type: () => AnswerResponseDto, isArray: true })
  answers!: AnswerResponseDto[];

  @ApiProperty({ type: () => PhotoResponseDto, isArray: true })
  photos!: PhotoResponseDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class FeedMemberEntryDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: () => FeedMemberUserDto })
  user!: FeedMemberUserDto;

  @ApiPropertyOptional({ type: () => FeedEntryDto, nullable: true })
  entry!: FeedEntryDto | null;
}

export class GroupDailyFeedResponseDto {
  @ApiProperty({ description: 'ISO-8601 date string (date only)' })
  date!: string;

  @ApiProperty({ type: () => FeedMemberEntryDto, isArray: true })
  members!: FeedMemberEntryDto[];
}

export function toGroupDailyFeedResponseDto(
  date: Date,
  memberships: MembershipWithUserAndEntry[],
): GroupDailyFeedResponseDto {
  return {
    date: date.toISOString().split('T')[0],
    members: memberships.map((m) => ({
      userId: m.userId,
      user: {
        id: m.user.id,
        name: m.user.name,
        profileImageKey: m.user.profileImageKey,
      },
      entry: m.entry
        ? {
            id: m.entry.id,
            diaryDate: m.entry.diaryDate.toISOString().split('T')[0],
            answers: m.entry.answers.map(toAnswerResponseDto),
            photos: m.entry.photos.map(toPhotoResponseDto),
            createdAt: m.entry.createdAt.toISOString(),
            updatedAt: m.entry.updatedAt.toISOString(),
          }
        : null,
    })),
  };
}
