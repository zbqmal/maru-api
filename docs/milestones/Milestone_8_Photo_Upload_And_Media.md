# M8 — Photo Upload and Media

## PR 1 — Media Model and S3 Foundation

- Add `photos`.
- Add S3 configuration.
- Create `MediaModule`.
- Implement storage-key generation conventions.
- Add file MIME-type and size policies.
- Keep AWS credentials server-side only.
- Add unit tests for validation/key generation.

## PR 2 — Presigned Diary Photo Upload

- Implement endpoint/service for requesting a short-lived S3 presigned upload URL.
- Validate authentication.
- Validate group membership.
- Validate diary ownership.
- Validate requested MIME type and size.
- Return the upload URL and storage key without proxying image bytes through NestJS.
- Add authorization and validation tests.

## PR 3 — Photo Registration and Deletion

- Implement photo metadata registration after successful upload.
- Associate photos with diary entries.
- Implement photo deletion.
- Delete corresponding S3 objects where required.
- Prevent users from registering arbitrary/unowned storage keys.
- Add integration tests with S3 mocked.

## PR 4 — Profile and Group Media Support

- Reuse the media infrastructure for profile images.
- Add group image support if the product uses group images at this stage.
- Implement replacement/removal cleanup behavior.
- Add ownership/authorization tests.
