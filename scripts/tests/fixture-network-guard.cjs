// Preload for disposable-fixture tests. No .env files or remote services allowed.
for (const key of Object.keys(process.env)) {
  if (/^(PADDLE_|RESEND_|OPENAI_|SUPABASE_|NEXT_PUBLIC_SUPABASE_|SMTP_|EMAIL_)/.test(key)) delete process.env[key];
}
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
process.env.NEXT_PUBLIC_PADDLE_ENV = 'production';
globalThis.fetch = async () => { throw new Error('Outbound fetch disabled: disposable fixture tests only'); };
const http = require('node:http');
const https = require('node:https');
for (const transport of [http, https]) {
  transport.request = transport.get = () => { throw new Error('Outbound HTTP disabled: disposable fixture tests only'); };
}
