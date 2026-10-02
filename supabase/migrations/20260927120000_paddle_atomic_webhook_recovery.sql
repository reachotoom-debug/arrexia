-- Deploy before the matching application code; drain old webhook workers first.
-- Explicitly classified production failed/processing events recover on redelivery.
-- Production-first: historical NULL provenance is preserved, never inferred.
ALTER TABLE public.workspace_subscriptions ADD COLUMN paddle_environment text
  CHECK (paddle_environment IN ('sandbox','production'));
ALTER TABLE public.paddle_webhook_events
  ADD COLUMN paddle_environment text CHECK (paddle_environment IN ('sandbox','production')),
  ADD COLUMN claim_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.workspace_subscriptions
  ADD COLUMN provider_last_event_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN provider_last_event_id text;

-- Deliberately fail migration on conflicting existing identities; never merge tenants.
CREATE UNIQUE INDEX workspace_subscriptions_paddle_subscription_key
  ON public.workspace_subscriptions(provider_subscription_id)
  WHERE payment_provider = 'paddle' AND provider_subscription_id IS NOT NULL;

CREATE TABLE public.paddle_subscription_bindings (
  provider_subscription_id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_customer_id text,
  paddle_environment text CHECK (paddle_environment IN ('sandbox','production')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.paddle_subscription_bindings ENABLE ROW LEVEL SECURITY;
-- TRUNCATE bypasses RLS and row triggers; client roles must never erase billing history.
REVOKE TRUNCATE ON TABLE public.workspace_subscriptions, public.workspace_plans,
  public.paddle_webhook_events, public.paddle_subscription_bindings
  FROM PUBLIC, anon, authenticated;
INSERT INTO public.paddle_subscription_bindings(provider_subscription_id, workspace_id, provider_customer_id, paddle_environment)
SELECT provider_subscription_id, workspace_id, provider_customer_id, paddle_environment
FROM public.workspace_subscriptions
WHERE payment_provider = 'paddle' AND provider_subscription_id IS NOT NULL;

CREATE FUNCTION public.rpc_claim_paddle_webhook(p_event_id text, p_event_type text, p_occurred_at timestamptz, p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_event public.paddle_webhook_events%ROWTYPE; v_token uuid;
BEGIN
  IF p_environment IS DISTINCT FROM 'production' THEN RAISE EXCEPTION 'Production billing only'; END IF;
  IF nullif(btrim(p_event_id), '') IS NULL OR nullif(btrim(p_event_type), '') IS NULL
     OR p_occurred_at IS NULL OR NOT isfinite(p_occurred_at) THEN
    RAISE EXCEPTION 'Invalid Paddle event envelope';
  END IF;
  INSERT INTO public.paddle_webhook_events(event_id,event_type,occurred_at,status,paddle_environment)
    VALUES(p_event_id,p_event_type,p_occurred_at,'processing',p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT v_event FROM public.paddle_webhook_events WHERE event_id=p_event_id FOR UPDATE;
  IF v_event.paddle_environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'Historical webhook requires environment classification';
  END IF;
  IF v_event.event_type IS DISTINCT FROM p_event_type OR v_event.occurred_at IS DISTINCT FROM p_occurred_at THEN
    RAISE EXCEPTION 'Paddle event envelope conflict';
  END IF;
  IF v_event.status IN ('processed','ignored') THEN
    RETURN jsonb_build_object('state','duplicate','status',v_event.status,'result',v_event.result);
  END IF;
  IF v_event.status='processing' AND v_event.lease_expires_at > clock_timestamp() THEN
    RETURN jsonb_build_object('state','busy');
  END IF;
  v_token := gen_random_uuid();
  UPDATE public.paddle_webhook_events SET status='processing', claim_token=v_token,
    lease_expires_at=clock_timestamp()+interval '5 minutes', attempts=attempts+1, processed_at=NULL, result=NULL
    WHERE event_id=p_event_id;
  RETURN jsonb_build_object('state','new','claim_token',v_token);
END $$;

-- Only failure/non-billing ignore paths use this function. Fulfillment completes inside apply.
CREATE FUNCTION public.rpc_finish_paddle_webhook(p_event_id text,p_claim_token uuid,p_status text,p_result text,p_environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_environment IS DISTINCT FROM 'production' THEN RAISE EXCEPTION 'Production billing only'; END IF;
  IF p_status NOT IN ('failed','ignored') THEN RAISE EXCEPTION 'Invalid completion status'; END IF;
  UPDATE public.paddle_webhook_events SET status=p_status,result=p_result,processed_at=clock_timestamp(),lease_expires_at=NULL
    WHERE event_id=p_event_id AND paddle_environment=p_environment AND claim_token=p_claim_token AND status='processing'
      AND lease_expires_at > clock_timestamp();
  RETURN FOUND;
END $$;

CREATE FUNCTION public.rpc_apply_paddle_webhook(p_event_id text,p_claim_token uuid,p_payload jsonb,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_event public.paddle_webhook_events%ROWTYPE;
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_binding public.paddle_subscription_bindings%ROWTYPE;
  v_workspace uuid; v_current_workspace uuid;
  v_hint uuid := nullif(p_payload->>'workspace_id','')::uuid;
  v_subscription text := nullif(p_payload->>'provider_subscription_id','');
  v_customer text := nullif(p_payload->>'provider_customer_id','');
  v_raw_status text := p_payload->>'provider_status';
  v_status text := p_payload->>'status';
  v_created_at timestamptz := (p_payload->>'provider_created_at')::timestamptz;
  v_replacement boolean := false;
  v_priority integer; v_stored_priority integer;
  v_transaction boolean; v_reason text; v_snapshot jsonb;
BEGIN
  IF p_environment IS DISTINCT FROM 'production' OR p_payload->>'paddle_environment' IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'Production billing environment required';
  END IF;
  SELECT * INTO STRICT v_event FROM public.paddle_webhook_events WHERE event_id=p_event_id FOR UPDATE;
  IF v_event.paddle_environment IS DISTINCT FROM p_environment OR v_event.status <> 'processing' OR v_event.claim_token IS DISTINCT FROM p_claim_token
     OR v_event.lease_expires_at IS NULL OR v_event.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Paddle claim lost or expired';
  END IF;
  v_transaction := v_event.event_type='transaction.completed';
  IF NOT v_transaction AND v_event.event_type NOT IN ('subscription.created','subscription.activated',
    'subscription.updated','subscription.canceled','subscription.past_due','subscription.paused','subscription.resumed') THEN
    RAISE EXCEPTION 'Unsupported Paddle event';
  END IF;
  IF v_subscription IS NULL OR v_customer IS NULL OR p_payload->>'plan' IS NULL
     OR p_payload->>'plan' NOT IN ('starter','pro','business')
     OR p_payload->>'billing_interval' IS NULL OR p_payload->>'billing_interval' NOT IN ('monthly','annual')
     OR v_status IS NULL OR v_raw_status IS NULL THEN
    RAISE EXCEPTION 'Invalid Paddle billing payload';
  END IF;
  -- Preserve the existing entitlement mapping; do not change trial/grace policy here.
  IF (v_transaction AND (v_raw_status <> 'completed' OR v_status <> 'active')) OR
     (NOT v_transaction AND v_status IS DISTINCT FROM CASE v_raw_status
       WHEN 'active' THEN 'active' WHEN 'trialing' THEN 'active'
       WHEN 'past_due' THEN 'past_due' WHEN 'paused' THEN 'past_due'
       WHEN 'canceled' THEN 'cancelled' ELSE 'expired' END) THEN
    RAISE EXCEPTION 'Invalid Paddle status mapping';
  END IF;

  -- Serialize initial binding attempts for the same provider ID, including across tenants.
  PERFORM pg_advisory_xact_lock(hashtextextended('paddle:' || v_subscription,0));
  SELECT * INTO v_binding FROM public.paddle_subscription_bindings WHERE provider_subscription_id=v_subscription;
  SELECT workspace_id INTO v_current_workspace FROM public.workspace_subscriptions
    WHERE payment_provider='paddle' AND provider_subscription_id=v_subscription;
  IF v_binding.workspace_id IS NOT NULL AND v_current_workspace IS NOT NULL
     AND v_binding.workspace_id <> v_current_workspace THEN RAISE EXCEPTION 'Paddle workspace binding conflict'; END IF;
  v_workspace := coalesce(v_binding.workspace_id,v_current_workspace,v_hint);
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'Paddle workspace unresolved'; END IF;
  IF v_hint IS NOT NULL AND v_hint <> v_workspace THEN RAISE EXCEPTION 'Paddle workspace hint conflict'; END IF;
  IF v_binding.provider_customer_id IS NOT NULL AND v_binding.provider_customer_id <> v_customer THEN
    RAISE EXCEPTION 'Paddle customer binding conflict';
  END IF;
  PERFORM id FROM public.workspaces WHERE id=v_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paddle workspace unresolved'; END IF;
  SELECT * INTO v_sub FROM public.workspace_subscriptions WHERE workspace_id=v_workspace FOR UPDATE;
  IF v_sub.payment_provider='paddle' AND v_sub.paddle_environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'Existing Paddle subscription requires environment classification';
  END IF;
  IF v_binding.provider_subscription_id IS NOT NULL AND v_binding.paddle_environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'Historical Paddle binding requires environment classification';
  END IF;
  IF v_sub.payment_provider IS DISTINCT FROM 'paddle' AND v_sub.status IN ('active','past_due')
     AND v_sub.plan IN ('starter','pro','business') THEN
    RAISE EXCEPTION 'Existing manual entitlement requires approved transition';
  END IF;

  IF v_binding.workspace_id IS NULL AND v_sub.payment_provider='paddle'
     AND v_sub.provider_subscription_id IS NOT NULL AND v_sub.provider_subscription_id <> v_subscription
     AND NOT v_transaction THEN
    -- Any lifecycle snapshot of a genuinely new subscription can replace a terminal one,
    -- including a pause/cancel delivered before creation. A known historical ID
    -- can never take this branch. Require provider creation time, not arrival time.
    IF v_sub.provider_customer_id IS DISTINCT FROM v_customer THEN
      RAISE EXCEPTION 'Paddle customer replacement conflict';
    END IF;
    IF v_created_at IS NULL OR NOT isfinite(v_created_at) OR v_sub.provider_last_event_at IS NULL
       OR v_created_at <= v_sub.provider_last_event_at OR v_event.occurred_at < v_created_at THEN
      RAISE EXCEPTION 'Paddle replacement chronology unresolved';
    END IF;
    IF v_sub.status NOT IN ('cancelled','expired') THEN
      -- Cancellation may be delivered later. Keep this event retryable, never auto-cancel
      -- an existing paid subscription or silently discard an already-paid replacement.
      RAISE EXCEPTION 'Paddle replacement awaiting terminal subscription';
    END IF;
    v_replacement := true;
  END IF;

  IF v_transaction AND v_binding.workspace_id IS NULL AND v_sub.payment_provider='paddle'
     AND v_sub.provider_subscription_id IS NOT NULL AND v_sub.provider_subscription_id <> v_subscription THEN
    RAISE EXCEPTION 'Paddle transaction awaiting subscription binding';
  END IF;

  IF NOT v_replacement AND v_sub.provider_subscription_id IS NOT NULL AND
      (v_sub.payment_provider IS DISTINCT FROM 'paddle' OR v_sub.provider_subscription_id <> v_subscription) THEN
    v_reason := 'subscription_identity_conflict';
  ELSIF v_binding.workspace_id IS NOT NULL AND v_sub.provider_subscription_id IS DISTINCT FROM v_subscription THEN
    -- A historical binding cannot resurrect after its current mapping was removed/replaced.
    v_reason := 'subscription_identity_conflict';
  ELSIF v_sub.payment_provider='paddle' AND v_sub.provider_customer_id IS NOT NULL
      AND v_sub.provider_customer_id <> v_customer THEN
    RAISE EXCEPTION 'Paddle customer identity conflict';
  ELSIF v_transaction AND (v_sub.provider_subscription_id IS NOT NULL OR v_sub.payment_provider='paddle') THEN
    -- Transactions confirm payment, not lifecycle state. Subscription events own renewals,
    -- plan changes, cancellation and resumption. Only the first transaction may bootstrap.
    v_reason := 'transaction_subscription_already_bound';
  END IF;

  IF NOT v_transaction AND v_reason IS NULL THEN
    v_priority := CASE v_raw_status WHEN 'canceled' THEN 60 WHEN 'paused' THEN 50
      WHEN 'past_due' THEN 40 WHEN 'active' THEN 20 WHEN 'trialing' THEN 10 ELSE 70 END;
    -- Backfilled rows have no raw paused status; past_due is conservatively ranked as paused.
    v_stored_priority := CASE WHEN coalesce(v_sub.provider_last_event_priority,0)>0 THEN v_sub.provider_last_event_priority
      ELSE CASE v_sub.status WHEN 'cancelled' THEN 60 WHEN 'past_due' THEN 50
        WHEN 'active' THEN 20 WHEN 'trial' THEN 10 ELSE 70 END END;
    IF v_sub.provider_last_event_at IS NOT NULL AND
      (v_event.occurred_at < v_sub.provider_last_event_at OR
        (v_event.occurred_at = v_sub.provider_last_event_at AND
          (v_priority < v_stored_priority OR (v_priority = v_stored_priority AND
            p_event_id COLLATE "C" <= coalesce(v_sub.provider_last_event_id,'') COLLATE "C")))) THEN
      v_reason := 'stale_event_ignored';
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.paddle_webhook_events SET status='ignored',result=v_reason,processed_at=clock_timestamp(),
      workspace_id=v_workspace,provider_subscription_id=v_subscription,lease_expires_at=NULL WHERE event_id=p_event_id;
    RETURN jsonb_build_object('action','ignored','reason',v_reason,'workspace_id',v_workspace,
      'notify_activation',v_reason='transaction_subscription_already_bound' AND v_sub.status='active'
        AND v_sub.plan=p_payload->>'plan' AND v_sub.billing_interval=p_payload->>'billing_interval',
      'period_ends_at',v_sub.current_period_ends_at);
  END IF;

  -- Existing RPC preserves trial consumption and atomically updates both billing tables.
  UPDATE public.paddle_webhook_events SET workspace_id=v_workspace WHERE event_id=p_event_id;
  PERFORM set_config('arrexia.paddle_claim',p_claim_token::text,true);
  v_snapshot := public.rpc_change_workspace_plan_atomic(
    p_workspace_id=>v_workspace, p_target_plan=>p_payload->>'plan',
    p_invoice_limit_monthly=>(p_payload->>'invoice_limit_monthly')::integer,
    p_client_limit=>(p_payload->>'client_limit')::integer,
    p_subscription_status=>v_status, p_subscription_plan=>p_payload->>'plan', p_payment_provider=>'paddle',
    p_trial_starts_at=>v_sub.trial_starts_at, p_trial_ends_at=>v_sub.trial_ends_at,
    p_current_period_starts_at=>coalesce((p_payload->>'period_starts_at')::timestamptz,CASE WHEN NOT v_replacement THEN v_sub.current_period_starts_at END),
    p_current_period_ends_at=>coalesce((p_payload->>'period_ends_at')::timestamptz,CASE WHEN NOT v_replacement THEN v_sub.current_period_ends_at END),
    p_cancel_at_period_end=>coalesce((p_payload->>'cancel_at_period_end')::boolean,false),
    p_billing_interval=>p_payload->>'billing_interval');
  IF v_snapshot->>'subscription_status' IS DISTINCT FROM v_status OR
     v_snapshot->>'stored_plan' IS DISTINCT FROM p_payload->>'plan' THEN
    RAISE EXCEPTION 'Paddle billing snapshot mismatch';
  END IF;
  INSERT INTO public.paddle_subscription_bindings(provider_subscription_id,workspace_id,provider_customer_id,paddle_environment)
    VALUES(v_subscription,v_workspace,v_customer,p_environment) ON CONFLICT(provider_subscription_id)
    DO UPDATE SET provider_customer_id=coalesce(public.paddle_subscription_bindings.provider_customer_id,EXCLUDED.provider_customer_id);
  UPDATE public.workspace_subscriptions SET paddle_environment=p_environment,provider_subscription_id=v_subscription,provider_customer_id=v_customer,
    provider_last_event_at=CASE WHEN v_transaction THEN provider_last_event_at ELSE v_event.occurred_at END,
    provider_last_event_priority=CASE WHEN v_transaction THEN provider_last_event_priority ELSE v_priority END,
    provider_last_event_id=CASE WHEN v_transaction THEN provider_last_event_id ELSE p_event_id END
    WHERE workspace_id=v_workspace;
  v_reason := CASE WHEN v_transaction THEN 'transaction_completed_synced' ELSE 'subscription_synced' END;
  UPDATE public.paddle_webhook_events SET status='processed',result=v_reason,processed_at=clock_timestamp(),
    workspace_id=v_workspace,provider_subscription_id=v_subscription,lease_expires_at=NULL WHERE event_id=p_event_id;
  RETURN jsonb_build_object('action','fulfilled','reason',v_reason,'workspace_id',v_workspace,
    'period_ends_at',v_snapshot->>'current_period_ends_at','notify_activation',v_transaction);
END $$;

REVOKE ALL ON FUNCTION public.rpc_claim_paddle_webhook(text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_finish_paddle_webhook(text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rpc_apply_paddle_webhook(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_paddle_webhook(text,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_finish_paddle_webhook(text,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_apply_paddle_webhook(text,uuid,jsonb,text) TO service_role;

-- Old handlers/admin writes cannot mutate a Paddle projection outside a claimed
-- atomic fulfillment. GUC is transaction-local and checked against a live lease.
CREATE FUNCTION public.trg_paddle_live_projection_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_workspace uuid; v_protect boolean;
BEGIN
  v_workspace := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
  -- Preserve the existing deliberate workspace deletion cascade, not standalone
  -- removal of its subscription/plan history while the workspace still exists.
  IF TG_OP='DELETE' AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id=v_workspace) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='workspace_subscriptions' THEN
    v_protect := CASE WHEN TG_OP='INSERT' THEN NEW.payment_provider='paddle'
      WHEN TG_OP='DELETE' THEN OLD.payment_provider='paddle'
      ELSE NEW.payment_provider='paddle' OR OLD.payment_provider='paddle' END;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.workspace_subscriptions s
      WHERE (s.workspace_id=v_workspace OR (TG_OP='UPDATE' AND s.workspace_id=OLD.workspace_id))
        AND s.payment_provider='paddle') INTO v_protect;
  END IF;
  IF v_protect THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Paddle history cannot be deleted independently'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.paddle_webhook_events e WHERE
      e.claim_token::text=current_setting('arrexia.paddle_claim',true)
      AND e.workspace_id=v_workspace AND e.paddle_environment='production'
      AND e.status='processing' AND e.lease_expires_at > clock_timestamp()) THEN
      RAISE EXCEPTION 'Paddle projection requires atomic Live fulfillment';
    END IF;
    IF TG_TABLE_NAME='workspace_subscriptions' THEN NEW.paddle_environment := 'production'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER paddle_live_projection_guard BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_paddle_live_projection_guard();
CREATE TRIGGER paddle_live_plan_guard BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_plans
FOR EACH ROW EXECUTE FUNCTION public.trg_paddle_live_projection_guard();

-- Database import/capacity guards must enforce the same provenance as TypeScript.
CREATE OR REPLACE FUNCTION public.internal_import_entitlement_state(
  p_workspace_id uuid, OUT entitlement_state text, OUT can_mutate boolean,
  OUT client_limit integer, OUT trial_invoice_limit integer, OUT invoice_limit_monthly integer
) LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE v_plan text; v_sub record;
BEGIN
  SELECT wp.plan,wp.client_limit,wp.invoice_limit_monthly INTO v_plan,client_limit,invoice_limit_monthly
    FROM public.workspace_plans wp WHERE wp.workspace_id=p_workspace_id;
  IF v_plan IS NULL THEN v_plan:='free'; client_limit:=5; invoice_limit_monthly:=5; END IF;
  SELECT ws.status,ws.plan,ws.trial_starts_at,ws.trial_ends_at,ws.trial_consumed_at,
    ws.payment_provider,ws.paddle_environment INTO v_sub
    FROM public.workspace_subscriptions ws WHERE ws.workspace_id=p_workspace_id;
  trial_invoice_limit:=75;
  IF v_sub.payment_provider='paddle' AND v_sub.paddle_environment IS DISTINCT FROM 'production' THEN
    entitlement_state:='legacy_free'; can_mutate:=false; client_limit:=5; invoice_limit_monthly:=5; RETURN;
  END IF;
  IF v_sub.status IN ('active','past_due') AND v_sub.plan IN ('starter','pro','business') THEN
    entitlement_state:='paid'; can_mutate:=true;
    IF v_sub.plan='business' THEN client_limit:=NULL; invoice_limit_monthly:=NULL; END IF;
    RETURN;
  END IF;
  IF v_sub.status='trial' AND (v_sub.trial_consumed_at IS NOT NULL OR v_sub.trial_starts_at IS NOT NULL
    OR v_sub.plan IN ('starter','pro','business')) THEN
    IF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at>now() THEN
      entitlement_state:='trial'; can_mutate:=true; client_limit:=50; invoice_limit_monthly:=NULL; RETURN;
    END IF;
    entitlement_state:='trial_expired'; can_mutate:=false; client_limit:=50; invoice_limit_monthly:=NULL; RETURN;
  END IF;
  IF v_sub.status IN ('cancelled','expired') THEN entitlement_state:='trial_expired'; can_mutate:=false; RETURN; END IF;
  entitlement_state:='legacy_free'; can_mutate:=false;
  client_limit:=coalesce(client_limit,5); invoice_limit_monthly:=coalesce(invoice_limit_monthly,5);
END $$;
