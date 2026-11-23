import test from 'node:test';
import assert from 'node:assert/strict';
import {example,totals,validate,normalize} from './core.js';
import {stickerTimeline,stickerFrame} from './sticker-motion.js';
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
test('clock visits every hour, including empty hours, independently from food arrivals',()=>{
  const s=example('stickers');s.items=[];
  const timeline=stickerTimeline(s),seen=[];
  let previous=7;
  for(let t=0;t<=s.duration;t+=.01){
    const frame=stickerFrame(s,t,timeline);
    assert.ok(frame.hour>=previous&&frame.hour-previous<=1);
    if(!seen.includes(frame.clock))seen.push(frame.clock);
    previous=frame.hour;
  }
  assert.deepEqual(seen,Array.from({length:17},(_,i)=>`${String(i+7).padStart(2,'0')}:00`));
  assert.equal(stickerFrame(s,s.duration,timeline).clock,'23:00');
});
test('consumption times schedule arrivals and legacy offsets cannot change the animation',()=>{
  const s=example('stickers');
  const other=structuredClone(s);other.items.forEach((item,index)=>item.at=s.duration-.5-index*.1);
  const visual=frame=>({...frame,stickers:frame.stickers.map(({item,...pose})=>({...pose,id:item.id}))});
  for(const t of [0,2,5,9,s.duration])assert.deepEqual(visual(stickerFrame(s,t)),visual(stickerFrame(other,t)));
  const timeline=stickerTimeline(s);
  assert.deepEqual(timeline.events.map(event=>event.item.clock),[...s.items].map(item=>item.clock).sort());
  for(const event of timeline.events){
    assert.equal(stickerFrame(s,event.at,timeline).hour,Number(event.item.clock.slice(0,2)));
  }
  const early=structuredClone(s);early.items[0].clock='03:30';
  assert.equal(stickerFrame(early,0).clock,'03:00');
});
test('new stickers travel into the board and settle without persistent bouncing',()=>{
  const s=example('stickers'),timeline=stickerTimeline(s),event=timeline.events[0];
  const incoming=stickerFrame(s,event.at+timeline.entrance*.18,timeline).stickers[0];
  const settled=stickerFrame(s,event.at+timeline.entrance+.1,timeline).stickers[0];
  assert.ok(incoming.y>settled.y+100);
  assert.ok(incoming.scale>settled.scale);
  assert.equal(settled.alpha,1);assert.equal(settled.scale,1);
});
test('shared layout reflows from one to two to three columns without teleporting existing stickers',()=>{
  const s=example('stickers');
  s.items=Array.from({length:9},(_,i)=>({...s.items[0],id:`food-${i}`,side:0,clock:`${String(8+i).padStart(2,'0')}:00`}));
  const timeline=stickerTimeline(s);
  for(const [index,columns] of [[0,1],[3,2],[6,3]]){
    const at=timeline.events[index].at;
    assert.equal(stickerFrame(s,at+.001,timeline).columns,columns);
    if(index){
      const before=stickerFrame(s,at-.000001,timeline).stickers[0];
      const after=stickerFrame(s,at+.000001,timeline).stickers[0];
      assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.001);
    }
  }
});
test('dense short videos finish all food and preserve cents with every sticker inside its panel',()=>{
  const s=example('stickers');s.duration=3;
  s.items=Array.from({length:36},(_,i)=>({...s.items[0],id:`food-${i}`,side:i%2,clock:'23:59',at:0,amount:i%3?'0.10':'0.20'}));
  const frame=stickerFrame(s,3);
  assert.equal(frame.stickers.length,36);assert.equal(frame.columns,3);
  assert.deepEqual(frame.totals,totals(s,3));
  for(const pose of frame.stickers){
    const left=20+pose.item.side*258;
    assert.ok(pose.x-pose.size/2>=left);
    assert.ok(pose.x+pose.size/2<=left+242);
    assert.ok(pose.y-pose.size/2>=288);
    assert.ok(pose.y+pose.size/2+24<=876);
    assert.equal(pose.scale,1);
  }
  stickerFrame(s,1.7);
  assert.deepEqual(stickerFrame(s,3),frame);
});
