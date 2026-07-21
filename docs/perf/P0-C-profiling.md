# P0-C — Temporary Server Profiling

Enable structured server timing logs for workspace route diagnosis.

## Enable

Set environment variable:

```
ARREXIA_PERF=1
```

Logs appear on **stdout only** (Vercel function logs / local terminal). They are **not** sent to the browser.

## Disable / cleanup

Unset `ARREXIA_PERF` and remove all P0-C instrumentation (see batch cleanup plan).

## Local dev

```powershell
cd D:\arrexia\arrexia
$env:ARREXIA_PERF="1"
npm run dev
```

Navigate to a workspace route. Read timings in the terminal running `next dev`.

Requires valid Supabase env (`.env.local`) and authenticated session.

## Vercel Preview / Production

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Add `ARREXIA_PERF` = `1` for Preview (or Production briefly)
3. Redeploy
4. Reproduce slow navigation
5. Vercel Dashboard → Project → Logs (or Deployments → Functions → View logs)
6. Filter for `[perf]`

Remove the env var and redeploy after diagnosis.

## Cold start test (manual)

1. Hard refresh (Ctrl+Shift+R)
2. Open Invoices — note `[perf][invoice-list] total=…`
3. Navigate to Clients — note total
4. Return to Invoices — repeat 3×
5. Compare first vs subsequent `total` and `[perf][proxy] middlewareGetUser`

If first load is much higher than repeats, cold start may contribute.

## Region checks (manual)

Not configured in repo (`next.config.ts` has no `regions`).

- **Vercel:** Project → Settings → Functions → Function Region
- **Supabase:** Project Settings → General → Region

Compare both; cross-region adds RTT to every Supabase round-trip.

## Supabase logs

Dashboard → Logs → Postgres or API. PostgREST may show slow queries; exact duration availability varies by plan/log type. Use alongside `[perf]` labels to correlate query names with DB load.
