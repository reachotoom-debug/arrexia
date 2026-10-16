// Explicit pending rollout set only. Historical repair is deliberately absent.
module.exports=Object.freeze([
  '20261015010000_claim_reminder_delivery.sql',
  '20261015120000_invoice_import_stored_totals_consistency.sql',
  '20261015140000_payment_update_generated_net_guard.sql',
  '20261015150000_workspace_policy_fences.sql',
  '20261015151000_payment_write_boundary.sql',
  '20261015152000_remove_api_destructive_privileges.sql',
  '20261015153000_users_organizations_write_boundary.sql',
  '20261015154000_invoice_write_boundary.sql',
]);
