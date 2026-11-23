import {clamp,cents} from './core.js';

const smooth=p=>p*p*(3-2*p);
const lerp=(a,b,p)=>a+(b-a)*p;
const minute=clock=>Number(clock.slice(0,2))*60+Number(clock.slice(3));
const seed=id=>[...id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17);

function targets(events) {
  const counts=[0,1].map(side=>events.filter(event=>event.item.side===side).length);
  const maximum=Math.max(...counts),columns=maximum<=3?1:maximum<=6?2:3;
  const rowHeight=columns===1?178:columns===2?137:94;
  const cellWidth=226/columns,size=Math.min(144,cellWidth-8);
  const positions=new Map();
  for(const side of [0,1]){
    events.filter(event=>event.item.side===side).forEach((event,index)=>{
      positions.set(event.item.id,{
        x:20+side*258+8+cellWidth*(index%columns+.5),
        y:300+Math.floor(index/columns)*rowHeight+size/2,
        size,angle:((seed(event.item.id)%101)/100-.5)*.065,
      });
    });
  }
  return {positions,columns};
}
function poseAt(frame,id,time,duration) {
  const target=frame.to.get(id),from=frame.from.get(id)||target;
  const p=smooth(clamp((time-frame.at)/duration,0,1));
  return Object.fromEntries(['x','y','size','angle'].map(key=>[key,lerp(from[key],target[key],p)]));
}

export function stickerTimeline(state) {
  const startHour=Math.min(7,...state.items.map(item=>Math.floor(minute(item.clock)/60)));
  const endHour=23,opening=Math.min(.4,state.duration*.08),ending=Math.min(1,state.duration*.24);
  const slot=(state.duration-opening-ending)/(endHour-startHour+1);
  const entrance=Math.min(.72,Math.max(.28,slot*.85)),reflow=Math.min(.58,Math.max(.24,slot*.7));
  const ordered=[...state.items].sort((a,b)=>minute(a.clock)-minute(b.clock)||a.id.localeCompare(b.id));
  const hours=new Map();
  for(const item of ordered){
    const hour=Math.floor(minute(item.clock)/60);
    if(!hours.has(hour))hours.set(hour,[]);
    hours.get(hour).push(item);
  }
  const events=[];
  for(const [hour,items] of hours){
    items.forEach((item,index)=>{
      // Preserve minute order and separate equal-time arrivals within their hour.
      const fraction=(minute(item.clock)%60/60)*.65+index/items.length*.35;
      events.push({item,at:opening+(hour-startHour+fraction*.8)*slot});
    });
  }
  const frames=[];
  for(let index=0;index<events.length;){
    const at=events[index].at;
    let end=index+1;while(end<events.length&&events[end].at===at)end++;
    const previous=frames.at(-1),layout=targets(events.slice(0,end)),from=new Map();
    for(const [id,pose] of layout.positions){
      from.set(id,previous?.to.has(id)?poseAt(previous,id,at,reflow):pose);
    }
    frames.push({at,from,to:layout.positions,columns:layout.columns});
    index=end;
  }
  return {startHour,endHour,opening,slot,entrance,reflow,events,frames};
}

export function stickerFrame(state,time,timeline=stickerTimeline(state)) {
  const t=clamp(time,0,state.duration);
  const hour=clamp(timeline.startHour+Math.floor(Math.max(0,t-timeline.opening)/timeline.slot+1e-9),timeline.startHour,timeline.endHour);
  const layout=timeline.frames.findLast(frame=>frame.at<=t);
  const sums=[0,0],increments=[null,null],stickers=[];
  for(const event of timeline.events){
    const age=t-event.at;if(age<0)continue;
    const p=clamp(age/timeline.entrance,0,1),pose=poseAt(layout,event.item.id,t,timeline.reflow);
    const flight=1-(1-p)**3,side=event.item.side,variation=seed(event.item.id);
    const spawnX=141+side*258+((variation%41)-20),spawnY=910+pose.size/2;
    const settle=p<.68?0:(p-.68)/.32;
    const bounce=settle>0?Math.sin(settle*Math.PI*2)*Math.sin(settle*Math.PI)*5:0;
    stickers.push({
      item:event.item,
      x:lerp(spawnX,pose.x,flight)+(side?1:-1)*Math.sin(p*Math.PI)*14*(1-p),
      y:lerp(spawnY,pose.y,flight)-bounce,
      size:pose.size,angle:pose.angle+Math.sin(p*Math.PI*2)*(1-p)*.19,
      scale:1+.28*(1-p)**2+(settle>0?Math.sin(settle*Math.PI*2)*Math.sin(settle*Math.PI)*.055:0),
      alpha:clamp(age/.08,0,1),labelAlpha:clamp((p-.26)/.35,0,1),
    });
    const count=smooth(clamp((p-.28)/.72,0,1));
    sums[side]+=Math.round(cents(event.item.amount)*count);
    const incrementAge=age-timeline.entrance*.35;
    if(incrementAge>=0&&incrementAge<.8)increments[side]={amount:event.item.amount,progress:incrementAge/.8};
  }
  return {
    clock:`${String(hour).padStart(2,'0')}:00`,hour,
    stickers,totals:sums.map(sum=>sum/100),increments,columns:layout?.columns||1,
  };
}
