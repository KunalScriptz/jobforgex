
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('jobforge-digest-morning') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='jobforge-digest-morning');
SELECT cron.unschedule('jobforge-digest-evening') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='jobforge-digest-evening');

SELECT cron.schedule(
  'jobforge-digest-morning',
  '30 1 * * *',
  $$ SELECT net.http_post(
    url:='https://lccouhmuiagfedgifuvi.supabase.co/functions/v1/send-digest',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'jobforge-digest-evening',
  '30 12 * * *',
  $$ SELECT net.http_post(
    url:='https://lccouhmuiagfedgifuvi.supabase.co/functions/v1/send-digest',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);
