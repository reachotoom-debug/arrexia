#!/usr/bin/env ts-node
// @ts-nocheck
/**
 * Assert view contracts: verifies payments_view, invoices_view, and invoice_risk_view
 * have the expected columns and data types.
 */

import { Client } from 'pg';
import * as process from 'process';

interface ColumnDefinition {
  name: string;
  data_type: string;
}

interface ViewContract {
  viewName: string;
  expectedColumns: ColumnDefinition[];
}

// Expected view contracts based on canonical migrations
const VIEW_CONTRACTS: ViewContract[] = [
  {
    viewName: 'payments_view',
    expectedColumns: [
      { name: 'id', data_type: 'uuid' },
      { name: 'workspace_id', data_type: 'uuid' },
      { name: 'invoice_id', data_type: 'uuid' },
      { name: 'client_id', data_type: 'uuid' },
      { name: 'amount', data_type: 'numeric' },
      { name: 'currency', data_type: 'text' },
      { name: 'transaction_fee', data_type: 'numeric' },
      { name: 'net_amount', data_type: 'numeric' },
      { name: 'payment_date', data_type: 'date' },
      { name: 'method', data_type: 'text' },
      { name: 'status', data_type: 'text' },
      { name: 'transaction_id', data_type: 'text' },
      { name: 'proof_url', data_type: 'text' },
      { name: 'notes', data_type: 'text' },
      { name: 'payment_provider', data_type: 'text' },
      { name: 'created_at', data_type: 'timestamp with time zone' },
      { name: 'updated_at', data_type: 'timestamp with time zone' },
      { name: 'archived_at', data_type: 'timestamp with time zone' },
      { name: 'invoice_number', data_type: 'text' },
      { name: 'client_name', data_type: 'text' },
      { name: 'is_failed', data_type: 'boolean' },
      { name: 'paid_at', data_type: 'timestamp with time zone' },
    ],
  },
  {
    viewName: 'invoices_view',
    expectedColumns: [
      { name: 'id', data_type: 'uuid' },
      { name: 'workspace_id', data_type: 'uuid' },
      { name: 'client_id', data_type: 'uuid' },
      { name: 'client_name', data_type: 'text' },
      { name: 'invoice_number', data_type: 'text' },
      { name: 'issue_date', data_type: 'date' },
      { name: 'due_date', data_type: 'date' },
      { name: 'currency', data_type: 'text' },
      { name: 'total', data_type: 'numeric' },
      { name: 'paid', data_type: 'numeric' },
      { name: 'outstanding', data_type: 'numeric' },
      { name: 'base_status', data_type: 'text' },
      { name: 'display_status', data_type: 'text' },
      { name: 'is_overdue', data_type: 'boolean' },
      { name: 'overdue_days', data_type: 'integer' },
      { name: 'risk_level', data_type: 'text' },
      { name: 'po_number', data_type: 'text' },
      { name: 'notes', data_type: 'text' },
    ],
  },
  {
    viewName: 'invoice_risk_view',
    expectedColumns: [
      { name: 'workspace_id', data_type: 'uuid' },
      { name: 'invoice_id', data_type: 'uuid' },
      { name: 'client_id', data_type: 'uuid' },
      { name: 'client_name', data_type: 'text' },
      { name: 'invoice_number', data_type: 'text' },
      { name: 'issue_date', data_type: 'date' },
      { name: 'due_date', data_type: 'date' },
      { name: 'currency', data_type: 'text' },
      { name: 'total', data_type: 'numeric' },
      { name: 'paid', data_type: 'numeric' },
      { name: 'outstanding', data_type: 'numeric' },
      { name: 'overdue_days', data_type: 'integer' },
      { name: 'risk_level', data_type: 'text' },
      { name: 'display_status', data_type: 'text' },
    ],
  },
];

async function viewExists(client: Client, viewName: string): Promise<boolean> {
  const result = await client.query(
    `
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [viewName]
  );
  return result.rows.length > 0;
}

async function getViewColumns(client: Client, viewName: string): Promise<ColumnDefinition[]> {
  const result = await client.query(
    `
    SELECT
      column_name AS name,
      data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
    `,
    [viewName]
  );

  return result.rows.map((row) => ({
    name: row.name,
    data_type: row.data_type,
  }));
}

function normalizeDataType(dataType: string): string {
  // Normalize common variations
  return dataType
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compareColumns(expected: ColumnDefinition[], actual: ColumnDefinition[]): {
  missing: ColumnDefinition[];
  extra: ColumnDefinition[];
  typeMismatches: Array<{ column: string; expected: string; actual: string }>;
} {
  const expectedMap = new Map<string, string>();
  expected.forEach((col) => {
    expectedMap.set(col.name, normalizeDataType(col.data_type));
  });

  const actualMap = new Map<string, string>();
  actual.forEach((col) => {
    actualMap.set(col.name, normalizeDataType(col.data_type));
  });

  const missing: ColumnDefinition[] = [];
  const extra: ColumnDefinition[] = [];
  const typeMismatches: Array<{ column: string; expected: string; actual: string }> = [];

  // Find missing columns
  expected.forEach((exp) => {
    if (!actualMap.has(exp.name)) {
      missing.push(exp);
    } else {
      const expType = normalizeDataType(exp.data_type);
      const actType = actualMap.get(exp.name)!;
      if (expType !== actType) {
        typeMismatches.push({
          column: exp.name,
          expected: exp.data_type,
          actual: actual.find((a) => a.name === exp.name)?.data_type || 'unknown',
        });
      }
    }
  });

  // Find extra columns
  actual.forEach((act) => {
    if (!expectedMap.has(act.name)) {
      extra.push(act);
    }
  });

  return { missing, extra, typeMismatches };
}

function formatDiff(viewName: string, diff: ReturnType<typeof compareColumns>): string {
  const lines: string[] = [`View: ${viewName}`];
  lines.push('='.repeat(60));

  if (diff.missing.length > 0) {
    lines.push(`\nMissing columns (${diff.missing.length}):`);
    diff.missing.forEach((col) => {
      lines.push(`  - ${col.name} (${col.data_type})`);
    });
  }

  if (diff.extra.length > 0) {
    lines.push(`\nExtra columns (${diff.extra.length}):`);
    diff.extra.forEach((col) => {
      lines.push(`  + ${col.name} (${col.data_type})`);
    });
  }

  if (diff.typeMismatches.length > 0) {
    lines.push(`\nType mismatches (${diff.typeMismatches.length}):`);
    diff.typeMismatches.forEach((mismatch) => {
      lines.push(`  ! ${mismatch.column}: expected ${mismatch.expected}, got ${mismatch.actual}`);
    });
  }

  return lines.join('\n');
}

async function assertViewContract(
  client: Client,
  contract: ViewContract
): Promise<{ success: boolean; diff?: string }> {
  const exists = await viewExists(client, contract.viewName);
  if (!exists) {
    return {
      success: false,
      diff: `View ${contract.viewName} does not exist`,
    };
  }

  const actualColumns = await getViewColumns(client, contract.viewName);
  const diff = compareColumns(contract.expectedColumns, actualColumns);

  const hasIssues =
    diff.missing.length > 0 || diff.extra.length > 0 || diff.typeMismatches.length > 0;

  if (hasIssues) {
    return {
      success: false,
      diff: formatDiff(contract.viewName, diff),
    };
  }

  return { success: true };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[fatal] DATABASE_URL environment variable is not set');
    console.error('Set it to your Postgres connection string (e.g., postgresql://postgres:postgres@localhost:55432/postgres)');
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    let allPassed = true;
    const failures: string[] = [];

    for (const contract of VIEW_CONTRACTS) {
      console.log(`Checking ${contract.viewName}...`);
      const result = await assertViewContract(client, contract);

      if (result.success) {
        console.log(`✓ ${contract.viewName} matches contract\n`);
      } else {
        console.log(`✗ ${contract.viewName} contract mismatch:`);
        console.log(result.diff);
        console.log('');
        allPassed = false;
        failures.push(result.diff || `View ${contract.viewName} failed`);
      }
    }

    await client.end();

    if (allPassed) {
      console.log('All view contracts verified successfully ✓');
      process.exit(0);
    } else {
      console.error('\nView contract assertions failed:');
      failures.forEach((failure) => console.error(`\n${failure}`));
      process.exit(1);
    }
  } catch (error) {
    console.error('[fatal] Database error:', error);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[fatal] Unexpected error:', error);
  process.exit(1);
});

