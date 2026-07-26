-- AUTH-SEC-2: Trusted Arrexia account activation state (service-role writes only)

CREATE TABLE IF NOT EXISTS public.user_account_activation (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activation_method text NOT NULL CHECK (
    activation_method IN ('email_signup', 'oauth', 'legacy_backfill')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_account_activation_activated_at_idx
  ON public.user_account_activation (activated_at DESC);

COMMENT ON TABLE public.user_account_activation IS
  'Security-authoritative Arrexia account activation. Service-role writes only.';

COMMENT ON COLUMN public.user_account_activation.activation_method IS
  'email_signup = confirmed email signup; oauth = OAuth provider; legacy_backfill = migration/runtime safety net.';

-- RLS enabled with no client policies (service role bypasses RLS)
ALTER TABLE public.user_account_activation ENABLE ROW LEVEL SECURITY;

-- Trusted email lookup for server-side forgot-password (service role only)
CREATE OR REPLACE FUNCTION public.lookup_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE u.email IS NOT NULL
    AND lower(trim(u.email)) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_auth_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_auth_user_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lookup_auth_user_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_auth_user_id_by_email(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Legacy backfill (conservative — not inferred from Supabase confirmation timestamps alone)
-- ---------------------------------------------------------------------------

-- A. Users with existing workspace membership
INSERT INTO public.user_account_activation (user_id, activated_at, activation_method)
SELECT
  wm.user_id,
  MIN(wm.created_at),
  'legacy_backfill'
FROM public.workspace_members wm
GROUP BY wm.user_id
ON CONFLICT (user_id) DO NOTHING;

-- B. OAuth identities (provider other than email)
INSERT INTO public.user_account_activation (user_id, activated_at, activation_method)
SELECT
  i.user_id,
  COALESCE(i.created_at, u.created_at, now()),
  'oauth'
FROM auth.identities i
JOIN auth.users u ON u.id = i.user_id
WHERE i.provider IS NOT NULL
  AND i.provider <> 'email'
ON CONFLICT (user_id) DO NOTHING;
