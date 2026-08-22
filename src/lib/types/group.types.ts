import { Group, GroupMember, GroupQuestion, User } from '@prisma/client';

type GroupMemberUserSummary = Pick<User, 'id' | 'name' | 'profileImageKey'>;

export type GroupMembershipWithUser = GroupMember & {
  user: GroupMemberUserSummary;
};

export type GroupWithMemberships = Group & {
  memberships: GroupMembershipWithUser[];
};

export type GroupMemberUser =
  GroupWithMemberships['memberships'][number]['user'];

export type GroupQuestionRecord = GroupQuestion;
