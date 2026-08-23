-- Public invoice online access token (View Invoice Online V1).
-- Opaque token for unauthenticated customer invoice viewing via /i/{token}.
-- Does NOT grant anon SELECT on invoices or financial views.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_access_token text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_access_token_unique
  ON public.invoices (public_access_token)
  WHERE public_access_token IS NOT NULL;

COMMENT ON COLUMN public.invoices.public_access_token IS
  'Opaque URL-safe token for public read-only invoice page (/i/{token}). Created lazily on customer delivery.';
