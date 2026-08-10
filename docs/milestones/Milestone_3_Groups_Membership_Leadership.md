# M3 — Groups, Membership, and Leadership

## PR 1 — Group and Membership Data Model

- Add `groups`.
- Add `group_members`.
- Add `LEADER` and `MEMBER` roles.
- Add the `(group_id, user_id)` uniqueness constraint.
- Establish the invariant that every active group has one leader.
- Add `GroupModule` and membership-related services.
- Add model/service tests.

## PR 2 — Group Creation and Retrieval

- Implement group creation.
- Automatically create the creator's `LEADER` membership.
- Implement list-groups-for-current-user.
- Implement group detail retrieval.
- Implement member listing.
- Enforce membership for private group reads.
- Add authorization and integration tests.

## PR 3 — Group Update and Leader Authorization

- Implement group updates.
- Add reusable group-member and group-leader authorization helpers/guards.
- Restrict leader-only mutations.
- Add tests proving normal members cannot perform leader operations.

## PR 4 — Leadership Transfer and Leave Group

- Implement explicit leadership transfer.
- Implement member leave-group behavior.
- Handle leader leave when members remain.
- Use the longest-standing remaining member as the fallback successor when automatic transfer is required.
- Handle the leader being the final group member.
- Add transactional tests for all leadership transitions.

## PR 5 — Group Deletion

- Implement leader-only group deletion.
- Delete the group and currently associated relational data safely.
- Establish a deletion service that can be extended when diary/media entities are added later.
- Add destructive-operation tests.

> Full deletion lifecycle behavior is revisited in M12 after diary entries, media, comments, and reactions exist.
