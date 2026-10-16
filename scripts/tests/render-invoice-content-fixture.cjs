// Synthetic PDF visual QA; no settings, customer, environment, logo or network fetches.
process.env.TS_NODE_PROJECT = 'scripts/tsconfig.json';
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const React = require('react');
const jsx = require('react/jsx-runtime');
(async () => {
  const renderer = await import('@react-pdf/renderer');
  // Register the same family with an installed local font to keep the fixture offline.
  renderer.Font.register({ family: 'Inter', fonts: [
    { src: 'C:/Windows/Fonts/arial.ttf', fontWeight: 400 },
    { src: 'C:/Windows/Fonts/arial.ttf', fontWeight: 500 },
    { src: 'C:/Windows/Fonts/arialbd.ttf', fontWeight: 600 },
    { src: 'C:/Windows/Fonts/arialbd.ttf', fontWeight: 700 },
  ] });
  const dependencies = {
    'react/jsx-runtime': jsx, '@react-pdf/renderer': renderer,
    '@/lib/format/currency': require('../../lib/format/currency'),
    './status-ui': require('../../lib/invoices/status-ui'),
    './invoice-pdf-shared': require('../../lib/invoices/invoice-pdf-shared'),
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync('lib/invoices/InvoicePdfDocument.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require: id => {
    if (!(id in dependencies)) throw new Error('Unexpected dependency ' + id);
    return dependencies[id];
  } });
  const base = {
    id: 'synthetic-only', invoiceNumber: 'FIXTURE-001', issueDate: '2026-10-01', dueDate: '2026-10-31',
    clientName: 'Synthetic Customer', clientEmail: 'customer@example.invalid', workspaceName: 'Synthetic Company',
    workspaceEmail: 'billing@example.invalid', currency: 'USD', subtotal: 100, total: 100, discountPercent: 0,
    discountAmount: 0, taxPercent: 0, taxAmount: 0, outstanding: 100, amountPaid: 0, displayStatus: 'sent',
    items: [{ name: 'Project services', description: 'Synthetic QA line item', quantity: 2, unit_price: 50 }],
    notes: 'Delivery by Friday.\nPlease quote reference PO-123 when paying.', paymentTermsLabel: 'Net 30',
    thankYouMessage: 'Thank you for the project.', paymentDetails: { bankName: 'Synthetic Bank', bankAccountName: 'Synthetic Company', bankAccountNumber: '000000' },
  };
  const output = 'tmp/pdfs/invoice-content';
  mkdirSync(output, { recursive: true });
  for (const [name, invoice] of [['short', base], ['long', { ...base,
    items: Array.from({ length: 24 }, (_, i) => ({ name: `Synthetic service ${i + 1}`, description: 'A longer synthetic line description to exercise pagination.', quantity: 1, unit_price: 50 })),
    subtotal: 1200, total: 1200, outstanding: 1200,
    notes: Array.from({ length: 20 }, (_, i) => `Customer note ${i + 1}: Please include this delivery requirement in the final handover.`).join('\n'),
  }]]) {
    const buffer = await renderer.renderToBuffer(React.createElement(exports.InvoicePdfDocument, { invoice, logoSrc: null }));
    writeFileSync(`${output}/${name}.pdf`, buffer);
    console.log(`${output}/${name}.pdf (${buffer.length} bytes)`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
