# M14 — Production Hardening and Scale

M14 should not be implemented as one large speculative PR. Create focused PRs only when measurements or production requirements justify them.

## Candidate PR — Rate Limiting and Abuse Protection

- Add rate limits to authentication and other abuse-sensitive endpoints.
- Add stricter protection to password-reset and invitation workflows.
- Add tests for configured limits.

## Candidate PR — Database Performance

- Review production query metrics.
- Add or adjust indexes.
- Remove N+1 queries.
- Tune connection pooling.
- Introduce pagination where data volume requires it.
- Document relevant query/performance findings.

## Candidate PR — Redis Caching

- Identify measured read-heavy bottlenecks.
- Add caching only for appropriate data.
- Define cache keys and invalidation rules.
- Add cache-fallback tests.

## Candidate PR — Observability

- Add OpenTelemetry instrumentation.
- Add Sentry or equivalent error reporting if selected.
- Improve structured logs and request correlation.
- Add operational dashboards/alerts outside application code where appropriate.

## Candidate PR — Database Reliability

- Configure production backups.
- Verify restore procedures.
- Evaluate read replicas only when justified by load.
- Document recovery expectations.

## Candidate PR — Load and Security Testing

- Add representative load tests.
- Test high-traffic diary/feed endpoints.
- Review authentication/session security.
- Review group authorization boundaries.
- Add dependency/security scanning to CI.
