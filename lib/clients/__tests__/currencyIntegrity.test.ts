import assert from 'node:assert/strict';
import { it } from 'node:test';
import { aggregateClientInvoiceMetrics, sortClientsByComputedKey } from '../listQueryPlan';
it('keeps client invoice currencies separate', () => {
 const metrics = aggregateClientInvoiceMetrics([{client_id:'a', currency:'USD', outstanding:10, display_status:'sent',risk_level:null},{client_id:'a',currency:'EUR',outstanding:20,display_status:'sent',risk_level:null}]);
 assert.deepEqual(metrics.get('a')?.outstandingByCurrency,{USD:10,EUR:20});
 assert.equal(metrics.get('a')?.outstandingSum, undefined);
});
it('groups outstanding ranking by currency before comparing amounts', () => {
 const sorted=sortClientsByComputedKey([{id:'usd',outstandingByCurrency:{USD:10000}},{id:'eur',outstandingByCurrency:{EUR:1}}],'outstanding','desc');
 assert.deepEqual(sorted.map(x=>x.id),['eur','usd']);
});

import { readAllPages } from '../../db/readAllPages';
it('aggregates all client invoices beyond the API row cap', async () => {
 const rows = Array.from({length:1201},(_,i)=>({client_id:'a',currency:i===1200?'EUR':'USD',outstanding:1,display_status:'sent',risk_level:null}));
 const result=await readAllPages((from,to)=>Promise.resolve({data:rows.slice(from,to+1),error:null}));
 assert.deepEqual(aggregateClientInvoiceMetrics(result.data).get('a')?.outstandingByCurrency,{USD:1200,EUR:1});
});
it('does not publish partial client balances after later page failure', async () => {
 await assert.rejects(()=>readAllPages((from)=>Promise.resolve(from===0?{data:Array.from({length:500},()=>({client_id:'a'})),error:null}:{data:null,error:new Error('later page failed')})),/later page failed/);
});

import { formatClientCurrencyAmounts, sumClientCurrencyAmounts } from '../currencyPresentation';
it('omits redundant ISO suffix for single balances while identifying mixed dollar currencies', () => {
 assert.equal(formatClientCurrencyAmounts({USD:20000}),'$20,000.00');
 assert.equal(formatClientCurrencyAmounts({CAD:20}),'CA$20.00');
 assert.equal(formatClientCurrencyAmounts({USD:20,CAD:30}),'CA$30.00 CAD / $20.00 USD');
 assert.equal(formatClientCurrencyAmounts({'Unknown currency':20}),'Unknown currency 20.00');
 assert.equal(formatClientCurrencyAmounts({}),'--');
});
it('keeps billed, paid, and negative balances separate without workspace currency fallback', () => {
 const rows=[{currency:'USD',total:100,paid:20},{currency:'EUR',total:200,paid:30},{currency:null,total:-5,paid:0}];
 assert.deepEqual(sumClientCurrencyAmounts(rows,r=>r.total),{USD:100,EUR:200,'Unknown currency':-5});
 assert.deepEqual(sumClientCurrencyAmounts(rows,r=>r.paid),{USD:20,EUR:30,'Unknown currency':0});
 assert.match(formatClientCurrencyAmounts({'EUR':-5,'USD':100}),/-\u20ac5.00 EUR \/ \$100.00 USD/);
});
