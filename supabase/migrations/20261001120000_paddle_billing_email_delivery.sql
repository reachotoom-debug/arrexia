-- Additive Live billing-email outbox. Historical rows deliberately remain unclassified.
ALTER TABLE public.workspace_paid_lifecycle_events
 ADD COLUMN notification_kind text CHECK(notification_kind IN ('activation','renewal','annual_reminder')),
 ADD COLUMN delivery_status text CHECK(delivery_status IN ('pending','sending','sent','failed','uncertain','skipped')),
 ADD COLUMN paddle_environment text CHECK(paddle_environment IN ('production','sandbox')),
 ADD COLUMN provider_transaction_id text, ADD COLUMN period_starts_at timestamptz, ADD COLUMN period_ends_at timestamptz,
 ADD COLUMN payload jsonb, ADD COLUMN request_payload jsonb, ADD COLUMN claim_token uuid, ADD COLUMN lease_expires_at timestamptz,
 ADD COLUMN attempts integer NOT NULL DEFAULT 0, ADD COLUMN first_attempt_at timestamptz,
 ADD COLUMN uncertainty boolean NOT NULL DEFAULT false, ADD COLUMN uncertain_at timestamptz,
 ADD COLUMN available_at timestamptz, ADD COLUMN provider_message_id text, ADD COLUMN last_error text,
 ADD COLUMN resend_idempotency_key text;
ALTER TABLE public.workspace_paid_lifecycle_events ALTER COLUMN sent_at DROP NOT NULL, ALTER COLUMN sent_at DROP DEFAULT;
REVOKE ALL ON public.workspace_paid_lifecycle_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.workspace_paid_lifecycle_events TO service_role;
CREATE INDEX paid_billing_email_recovery_idx ON public.workspace_paid_lifecycle_events(delivery_status,available_at) WHERE notification_kind IS NOT NULL;

CREATE FUNCTION public.internal_paid_reminder_eligible(p_row public.workspace_paid_lifecycle_events) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspace_subscriptions s JOIN public.workspace_paid_lifecycle_events l
 ON l.provider_subscription_id=s.provider_subscription_id AND l.event_key='billing_lifecycle_state'
 WHERE s.workspace_id=p_row.workspace_id AND s.provider_subscription_id=p_row.provider_subscription_id
 AND s.payment_provider='paddle' AND s.paddle_environment='production' AND s.status='active' AND s.billing_interval='annual'
 AND NOT s.cancel_at_period_end AND s.current_period_ends_at=p_row.period_ends_at
 AND s.current_period_ends_at>clock_timestamp() AND s.current_period_ends_at<=clock_timestamp()+interval '30 days'
 AND l.workspace_id=s.workspace_id AND l.paddle_environment='production' AND l.metadata ? 'scheduled_change_action'
 AND l.metadata->'scheduled_change_action'='null'::jsonb AND l.metadata->>'raw_status'='active');
$$;
REVOKE ALL ON FUNCTION public.internal_paid_reminder_eligible(public.workspace_paid_lifecycle_events) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.rpc_claim_paid_billing_email(p_notification_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.workspace_paid_lifecycle_events%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.workspace_paid_lifecycle_events WHERE id=p_notification_id FOR UPDATE;
 IF NOT FOUND OR r.notification_kind IS NULL OR r.paddle_environment IS DISTINCT FROM 'production' OR r.delivery_status IN ('sent','skipped') THEN RETURN jsonb_build_object('state','unavailable'); END IF;
 IF r.delivery_status='sending' AND r.lease_expires_at>clock_timestamp() THEN RETURN jsonb_build_object('state','unavailable'); END IF;
 IF r.delivery_status='sending' AND r.first_attempt_at IS NOT NULL THEN
  UPDATE public.workspace_paid_lifecycle_events SET delivery_status='uncertain',uncertainty=true,uncertain_at=coalesce(uncertain_at,clock_timestamp()) WHERE id=r.id;
  r.uncertainty:=true;
 END IF;
 IF r.uncertainty AND r.first_attempt_at<=clock_timestamp()-interval '23 hours' THEN UPDATE public.workspace_paid_lifecycle_events SET available_at=NULL WHERE id=r.id; RETURN jsonb_build_object('state','unavailable'); END IF;
 IF r.available_at>clock_timestamp() THEN RETURN jsonb_build_object('state','unavailable'); END IF;
 IF r.notification_kind='activation' AND NOT EXISTS(SELECT 1 FROM public.workspace_subscriptions s WHERE s.workspace_id=r.workspace_id AND s.provider_subscription_id=r.provider_subscription_id AND s.payment_provider='paddle' AND s.paddle_environment='production' AND s.status='active') THEN
  UPDATE public.workspace_paid_lifecycle_events SET delivery_status='skipped',lease_expires_at=NULL WHERE id=r.id;
  RETURN jsonb_build_object('state','unavailable');
 END IF;
 IF r.notification_kind='annual_reminder' AND NOT public.internal_paid_reminder_eligible(r) THEN
  UPDATE public.workspace_paid_lifecycle_events SET delivery_status='skipped',lease_expires_at=NULL WHERE id=r.id;
  RETURN jsonb_build_object('state','unavailable');
 END IF;
 UPDATE public.workspace_paid_lifecycle_events SET delivery_status='sending',claim_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes',attempts=attempts+1 WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('state','claimed','notification',to_jsonb(r));
END $$;
CREATE FUNCTION public.rpc_prepare_paid_billing_email(p_notification_id uuid,p_claim_token uuid,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.workspace_paid_lifecycle_events%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.workspace_paid_lifecycle_events WHERE id=p_notification_id FOR UPDATE;
 IF NOT FOUND OR r.delivery_status<>'sending' OR r.claim_token IS DISTINCT FROM p_claim_token OR r.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Billing email claim lost or expired'; END IF;
 IF r.notification_kind='activation' AND NOT EXISTS(SELECT 1 FROM public.workspace_subscriptions s WHERE s.workspace_id=r.workspace_id AND s.provider_subscription_id=r.provider_subscription_id AND s.payment_provider='paddle' AND s.paddle_environment='production' AND s.status='active') THEN
  RAISE EXCEPTION 'Activation no longer eligible';
 END IF;
 IF r.notification_kind='annual_reminder' AND NOT public.internal_paid_reminder_eligible(r) THEN RAISE EXCEPTION 'Annual reminder no longer eligible'; END IF;
 IF r.uncertainty AND r.first_attempt_at<=clock_timestamp()-interval '23 hours' THEN RAISE EXCEPTION 'Billing email unknown acceptance window expired'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' THEN RAISE EXCEPTION 'Invalid billing email request'; END IF;
 UPDATE public.workspace_paid_lifecycle_events SET request_payload=coalesce(request_payload,p_request),first_attempt_at=coalesce(first_attempt_at,clock_timestamp()) WHERE id=r.id RETURNING * INTO r;
 RETURN r.request_payload;
END $$;
CREATE FUNCTION public.rpc_finish_paid_billing_email(p_notification_id uuid,p_claim_token uuid,p_outcome text,p_message_id text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_outcome='sent' AND nullif(btrim(p_message_id),'') IS NULL THEN RAISE EXCEPTION 'Provider message id required'; END IF;
 IF p_outcome NOT IN ('sent','failed','uncertain','skipped') THEN RAISE EXCEPTION 'Invalid billing email outcome'; END IF;
 UPDATE public.workspace_paid_lifecycle_events SET delivery_status=p_outcome,lease_expires_at=NULL,provider_message_id=p_message_id,last_error=p_error,
 sent_at=CASE WHEN p_outcome='sent' THEN clock_timestamp() ELSE sent_at END,
 uncertainty=CASE WHEN p_outcome='uncertain' THEN true WHEN p_outcome='sent' THEN false ELSE uncertainty END,
 uncertain_at=CASE WHEN p_outcome='uncertain' THEN coalesce(uncertain_at,clock_timestamp()) ELSE uncertain_at END,
 available_at=CASE WHEN p_outcome IN ('failed','uncertain') THEN clock_timestamp()+interval '5 minutes' ELSE available_at END
 WHERE id=p_notification_id AND claim_token=p_claim_token AND delivery_status='sending' AND lease_expires_at>clock_timestamp() AND (p_outcome<>'sent' OR request_payload IS NOT NULL);
 RETURN FOUND;
END $$;

ALTER FUNCTION public.rpc_apply_paddle_webhook(text,uuid,jsonb,text) RENAME TO internal_apply_paddle_webhook_core;
REVOKE ALL ON FUNCTION public.internal_apply_paddle_webhook_core(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.rpc_apply_paddle_webhook(p_event_id text,p_claim_token uuid,p_payload jsonb,p_environment text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; e public.paddle_webhook_events%ROWTYPE; s public.workspace_subscriptions%ROWTYPE; k text; kind text; nid uuid; snap jsonb;
BEGIN
 result:=public.internal_apply_paddle_webhook_core(p_event_id,p_claim_token,p_payload,p_environment);
 SELECT * INTO e FROM public.paddle_webhook_events WHERE event_id=p_event_id;
 SELECT * INTO s FROM public.workspace_subscriptions WHERE workspace_id=e.workspace_id;
 IF e.event_type<>'transaction.completed' AND result->>'action'='fulfilled' THEN
  INSERT INTO public.workspace_paid_lifecycle_events(workspace_id,provider_subscription_id,event_key,paddle_environment,metadata)
  VALUES(s.workspace_id,s.provider_subscription_id,'billing_lifecycle_state','production',jsonb_build_object('raw_status',p_payload->>'provider_status') ||
   CASE WHEN p_payload ? 'scheduled_change_action' THEN jsonb_build_object('scheduled_change_action',p_payload->'scheduled_change_action') ELSE '{}'::jsonb END)
  ON CONFLICT(provider_subscription_id,event_key) DO UPDATE SET metadata=EXCLUDED.metadata,paddle_environment=EXCLUDED.paddle_environment;
 END IF;
 IF e.event_type='transaction.completed' AND nullif(p_payload->>'transaction_id','') IS NOT NULL
 AND s.payment_provider='paddle' AND s.paddle_environment='production'
 AND s.provider_subscription_id=p_payload->>'provider_subscription_id' AND s.provider_customer_id=p_payload->>'provider_customer_id'
 AND result->>'reason' IN ('transaction_completed_synced','transaction_subscription_already_bound') THEN
  IF p_payload->>'transaction_origin' IN ('web','api','subscription_charge') AND (result->>'notify_activation')::boolean THEN kind:='activation'; k:='paid_subscription_activated';
  ELSIF p_payload->>'transaction_origin'='subscription_recurring' THEN kind:='renewal'; k:='paid_subscription_renewed:'||(p_payload->>'transaction_id'); END IF;
  IF kind IS NOT NULL THEN
   snap:=jsonb_build_object('plan',p_payload->>'plan','billing_interval',p_payload->>'billing_interval','transaction_totals',p_payload->'transaction_totals','transaction_id',p_payload->>'transaction_id');
   INSERT INTO public.workspace_paid_lifecycle_events(workspace_id,provider_subscription_id,event_key,notification_kind,delivery_status,paddle_environment,provider_transaction_id,period_starts_at,period_ends_at,payload,available_at,resend_idempotency_key)
   VALUES(s.workspace_id,s.provider_subscription_id,k,kind,'pending','production',p_payload->>'transaction_id',(p_payload->>'period_starts_at')::timestamptz,(p_payload->>'period_ends_at')::timestamptz,snap,clock_timestamp(),'paddle-billing-'||encode(sha256(convert_to('production:'||s.provider_subscription_id||':'||k,'UTF8')),'hex'))
   ON CONFLICT(provider_subscription_id,event_key) DO NOTHING RETURNING id INTO nid;
   IF nid IS NULL THEN SELECT id INTO nid FROM public.workspace_paid_lifecycle_events WHERE provider_subscription_id=s.provider_subscription_id AND event_key=k AND notification_kind IS NOT NULL; END IF;
  END IF;
 END IF;
 RETURN result||jsonb_build_object('notify_activation',false)||CASE WHEN nid IS NOT NULL THEN jsonb_build_object('notification_id',nid) ELSE '{}'::jsonb END;
END $$;
CREATE FUNCTION public.rpc_enqueue_annual_billing_reminders(p_limit int DEFAULT 25) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.workspace_subscriptions%ROWTYPE; r public.workspace_paid_lifecycle_events%ROWTYPE; n integer:=0; inserted integer;
BEGIN
 FOR s IN SELECT * FROM public.workspace_subscriptions WHERE payment_provider='paddle' AND paddle_environment='production' AND status='active' AND billing_interval='annual' AND NOT cancel_at_period_end AND current_period_ends_at>clock_timestamp() AND current_period_ends_at<=clock_timestamp()+interval '30 days' AND EXISTS(SELECT 1 FROM public.workspace_paid_lifecycle_events state WHERE state.workspace_id=workspace_subscriptions.workspace_id AND state.provider_subscription_id=workspace_subscriptions.provider_subscription_id AND state.event_key='billing_lifecycle_state' AND state.paddle_environment='production' AND state.metadata->>'raw_status'='active' AND state.metadata->'scheduled_change_action'='null'::jsonb) AND NOT EXISTS(SELECT 1 FROM public.workspace_paid_lifecycle_events existing WHERE existing.provider_subscription_id=workspace_subscriptions.provider_subscription_id AND existing.event_key='annual_renewal_reminder:'||to_char(workspace_subscriptions.current_period_ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY current_period_ends_at LIMIT greatest(0,least(coalesce(p_limit,25),25)) FOR UPDATE SKIP LOCKED LOOP
  r.workspace_id:=s.workspace_id;r.provider_subscription_id:=s.provider_subscription_id;r.period_ends_at:=s.current_period_ends_at;
  IF public.internal_paid_reminder_eligible(r) THEN
   INSERT INTO public.workspace_paid_lifecycle_events(workspace_id,provider_subscription_id,event_key,notification_kind,delivery_status,paddle_environment,period_starts_at,period_ends_at,payload,available_at,resend_idempotency_key)
   VALUES(s.workspace_id,s.provider_subscription_id,'annual_renewal_reminder:'||to_char(s.current_period_ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'annual_reminder','pending','production',s.current_period_starts_at,s.current_period_ends_at,jsonb_build_object('plan',s.plan,'billing_interval',s.billing_interval),clock_timestamp(),'paddle-reminder-'||encode(sha256(convert_to('production:'||s.provider_subscription_id||':'||to_char(s.current_period_ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'UTF8')),'hex')) ON CONFLICT(provider_subscription_id,event_key) DO NOTHING;
   GET DIAGNOSTICS inserted=ROW_COUNT;n:=n+inserted;
  END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.rpc_claim_paid_billing_email(uuid),public.rpc_prepare_paid_billing_email(uuid,uuid,jsonb),public.rpc_finish_paid_billing_email(uuid,uuid,text,text,text),public.rpc_enqueue_annual_billing_reminders(integer),public.rpc_apply_paddle_webhook(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_paid_billing_email(uuid),public.rpc_prepare_paid_billing_email(uuid,uuid,jsonb),public.rpc_finish_paid_billing_email(uuid,uuid,text,text,text),public.rpc_enqueue_annual_billing_reminders(integer),public.rpc_apply_paddle_webhook(text,uuid,jsonb,text) TO service_role;


-- The provider request snapshot cannot drift between attempts, including direct service writes.
CREATE FUNCTION public.internal_paid_email_request_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.request_payload IS NOT NULL AND NEW.request_payload IS DISTINCT FROM OLD.request_payload THEN RAISE EXCEPTION 'Billing email request is immutable'; END IF;
 IF OLD.request_payload IS NOT NULL AND NEW.resend_idempotency_key IS DISTINCT FROM OLD.resend_idempotency_key THEN RAISE EXCEPTION 'Billing email provider key is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER paid_email_request_immutable BEFORE UPDATE ON public.workspace_paid_lifecycle_events FOR EACH ROW EXECUTE FUNCTION public.internal_paid_email_request_immutable();
REVOKE ALL ON FUNCTION public.internal_paid_email_request_immutable() FROM PUBLIC,anon,authenticated,service_role;
