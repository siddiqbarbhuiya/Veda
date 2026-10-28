CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-circuit-breaker',
  '*/5 * * * *',
  $$DELETE FROM circuit_breaker_log WHERE requested_at < now() - interval '120 seconds'$$
);
