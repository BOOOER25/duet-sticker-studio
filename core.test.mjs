import test from 'node:test';
import assert from 'node:assert/strict';
import {example,totals,validate,normalize} from './core.js';
test('timeline totals include only revealed orders and preserve cents',()=>{
  const s=example('stickers');s.items=s.items.slice(0,3);
  assert.deepEqual(totals(s,0),[0,0]);
  assert.deepEqual(totals(s,4),[50.5,12]);
  s.items[0].amount='0.10';s.items[2].amount='0.20';
  assert.equal(totals(s,4)[0],.3);
});
test('reject invalid schedule, money, time and excessive side capacity',()=>{
  for(const change of [s=>s.items[0].at=99,s=>s.items[0].amount='-1',s=>s.items[0].clock='25:01',s=>s.items[0].amount='1.234']){
    const s=example('receipt');change(s);assert.throws(()=>validate(s));
  }
  const s=example('stickers');s.items=Array.from({length:19},(_,i)=>({...s.items[0],id:String(i),side:0}));assert.throws(()=>validate(s));
});
test('import removes remote references and rejects invalid schema',()=>{
  const s=example('receipt');s.people[0].avatar='https://tracking.example/a';s.extra='<script>';
  const clean=normalize(s);assert.equal(clean.people[0].avatar,'');assert.equal(clean.extra,undefined);
  assert.throws(()=>normalize({...s,version:2,duration:NaN}));
});
