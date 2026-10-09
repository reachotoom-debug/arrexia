-- Records security remediation already applied manually to production.
-- DO NOT reapply to production without reconciling migration history first.
-- No function bodies, signatures, or payment data are changed.
DO $$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.import_execute_payments(uuid,public.payment_import_row[])',
    'public.import_execute_payments(public.payment_import_row[],uuid)',
    'public.import_preview_payments(uuid,public.payment_import_row[])',
    'public.import_preview_payments(public.payment_import_row[],uuid)'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
      IF has_function_privilege('anon', target, 'EXECUTE')
         OR has_function_privilege('authenticated', target, 'EXECUTE') THEN
        RAISE EXCEPTION 'Inherited EXECUTE remains on %; inspect role membership/ownership', signature;
      END IF;
    END IF;
  END LOOP;

  target := to_regprocedure('public.rpc_import_payments(uuid,jsonb,boolean)');
  IF target IS NULL THEN
    RAISE EXCEPTION 'Required canonical rpc_import_payments(uuid,jsonb,boolean) is missing';
  END IF;
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target);
  IF has_function_privilege('anon', target, 'EXECUTE')
     OR has_function_privilege('authenticated', target, 'EXECUTE')
     OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
    RAISE EXCEPTION 'Canonical payment import effective privileges are unsafe';
  END IF;
END;
$$;
