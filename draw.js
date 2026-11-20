import {clamp,amount,totals,visibleItems} from './core.js';
import {project} from './project.js';
const FONT='"Microsoft YaHei","PingFang SC",system-ui,sans-serif';
const palettes={pink:['#f7d3dd','#e98da8','#fff9ed'],mint:['#cce9de','#70ad9c','#fffff6'],lilac:['#ded5f1','#9e8bc4','#fffdf7']};
const round=(c,x,y,w,h,r,fill)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();};
function text(c,s,x,y,size=16,color='#32333c',weight=500,align='left',max=Infinity) {
  c.save();c.font=`${weight} ${size}px ${FONT}`;c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';
  let str=String(s);while(c.measureText(str).width>max&&str.length>1)str=str.slice(0,-2)+'…';
  c.fillText(str,x,y);c.restore();
}
function cover(c,img,x,y,w,h) {
  const r=Math.max(w/img.width,h/img.height),iw=w/r,ih=h/r;
  c.drawImage(img,(img.width-iw)/2,(img.height-ih)/2,iw,ih,x,y,w,h);
}
function avatar(c,img,x,y,r,initial,fill) {
  c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.clip();c.fillStyle=fill;c.fillRect(x-r,y-r,2*r,2*r);
  if(img)cover(c,img,x-r,y-r,2*r,2*r);else text(c,initial?.slice(0,1)||'我',x,y,22,'#fff',700,'center');
  c.restore();
}
const stickerCache=new WeakMap();
function outlined(img) {
  if(stickerCache.has(img))return stickerCache.get(img);
  const c=document.createElement('canvas');c.width=c.height=240;const ctx=c.getContext('2d');
  const k=Math.min(216/img.width,216/img.height),w=img.width*k,h=img.height*k,x=(240-w)/2,y=(240-h)/2;
  const white=document.createElement('canvas');white.width=white.height=240;
  const wc=white.getContext('2d');wc.drawImage(img,x,y,w,h);wc.globalCompositeOperation='source-in';wc.fillStyle='white';wc.fillRect(0,0,240,240);
  ctx.shadowColor='#5c47542a';ctx.shadowBlur=9;ctx.shadowOffsetY=5;
  for(let a=0;a<Math.PI*2;a+=Math.PI/8)ctx.drawImage(white,Math.cos(a)*4,Math.sin(a)*4);
  ctx.shadowColor='transparent';ctx.drawImage(img,x,y,w,h);stickerCache.set(img,c);return c;
}
function product(c,img,item,x,y,w,h) {
  if(!img) {text(c,['🥪','☕','🍱','🍰'][Math.abs(item.name.length)%4],x+w/2,y+h/2,h*.6,'#333',400,'center');return;}
  const size=Math.min(w,h)*item.scale;
  c.drawImage(outlined(img),x+(w-size)/2,y+(h-size)/2,size,size);
}
export function createRenderer(bitmaps) {
  const get=id=>bitmaps.get(id);
  function background(c,s) {
    const [base,,paper]=palettes[s.theme]||palettes.pink;
    c.fillStyle=base;c.fillRect(0,0,540,960);
    const bg=get(s.background);
    if(bg) {cover(c,bg,0,0,540,960);c.fillStyle='#ffffff28';c.fillRect(0,0,540,960);}
    else {
      c.lineWidth=1;c.strokeStyle='#ffffff60';
      for(let x=0;x<=540;x+=24){c.beginPath();c.moveTo(x,0);c.lineTo(x,960);c.stroke();}
      for(let y=0;y<=960;y+=24){c.beginPath();c.moveTo(0,y);c.lineTo(540,y);c.stroke();}
      c.fillStyle=paper;c.beginPath();c.ellipse(270,490,241,455,0,0,Math.PI*2);c.fill();
      for(let a=0;a<Math.PI*2;a+=.055){c.fillStyle='#ffffffb8';c.beginPath();c.arc(270+242*Math.cos(a),490+455*Math.sin(a),5,0,Math.PI*2);c.fill();}
    }
  }
  function header(c,s,time) {
    const color=palettes[s.theme]?.[1]||'#e98da8';
    round(c,28,40,484,52,12,color);text(c,s.title,270,66,21,'white',700,'center',450);
    const visible=visibleItems(s,time).sort((a,b)=>a.at-b.at);
    text(c,visible.at(-1)?.clock||'07:00',270,139,42,'#252936',800,'center');
  }
  function board(c,s,time) {
    const sum=totals(s,time),accent=palettes[s.theme][1];
    round(c,20,183,500,94,23,'#ffffffed');
    avatar(c,get(s.people[0].avatar),62,229,27,s.people[0].name,accent);
    avatar(c,get(s.people[1].avatar),478,229,27,s.people[1].name,'#99bdac');
    text(c,s.people[0].name,101,211,13,'#56545e',600,'left',125);
    text(c,s.people[1].name,439,211,13,'#56545e',600,'right',125);
    text(c,amount(sum[0],s.unit),101,242,26,'#e48b3e',800,'left',145);
    text(c,amount(sum[1],s.unit),439,242,26,'#e48b3e',800,'right',145);
    text(c,'VS',270,232,29,'#d4c6e8',800,'center');
    [0,1].forEach(side=>{
      const x=20+side*258;round(c,x,288,242,588,20,'#fffffff0');
      c.fillStyle='#d7d2dc';
      for(let row=0;row<24;row++)for(let col=0;col<10;col++){c.beginPath();c.arc(x+13+col*24,300+row*24,.6,0,7);c.fill();}
      const all=s.items.filter(it=>it.side===side).sort((a,b)=>a.at-b.at);
      all.forEach((item,i)=>{
        if(item.at>time)return;
        const age=clamp((time-item.at)/.32,0,1),pop=1-Math.pow(1-age,3);
        const px=x+5+(i%3)*78,py=296+Math.floor(i/3)*95;
        c.save();c.globalAlpha=pop;c.translate(px+39,py+42);c.scale(.8+.2*pop,.8+.2*pop);c.translate(-39,-42);
        product(c,get(item.asset),item,0,0,78,68);
        round(c,25,0,51,17,5,'#fffdf4');text(c,amount(item.amount,s.unit),50,9,9,'#574d43',700,'center',49);
        text(c,item.name,39,77,10,'#66606a',500,'center',74);
        c.restore();
      });
    });
    text(c,s.footer,270,918,14,'#69606e',500,'center',472);
  }
  function receiptLayer(s,time) {
    const left=s.items.filter(x=>x.side===0).sort((a,b)=>a.at-b.at);
    const right=s.items.filter(x=>x.side===1).sort((a,b)=>a.at-b.at);
    const rows=Math.max(left.length,right.length,1),height=170+rows*100+230;
    const paper=document.createElement('canvas');paper.width=840;paper.height=height*2;
    const c=paper.getContext('2d');c.scale(2,2);
    c.fillStyle='#fffef7';c.fillRect(0,0,420,height);
    text(c,'TODAY, TOGETHER',210,40,20,'#484451',800,'center');
    text(c,'双人消费小票',210,68,12,'#89838c',500,'center');
    [0,1].forEach(side=>{
      const x=side?320:100;
      avatar(c,get(s.people[side].avatar),x,108,18,s.people[side].name,side?'#aacbbb':'#d7a7bb');
      text(c,s.people[side].name,x,140,13,'#4b4853',600,'center',160);
    });
    c.setLineDash([3,4]);c.strokeStyle='#c7c1c6';c.beginPath();c.moveTo(210,165);c.lineTo(210,height-220);c.stroke();c.setLineDash([]);
    let lastY=155;
    [left,right].forEach((items,side)=>items.forEach((item,i)=>{
      if(item.at>time)return;
      const y=168+i*100,x=side?228:18;lastY=Math.max(lastY,y+95);
      product(c,get(item.asset),item,x,y,68,70);
      text(c,item.name,x+73,y+21,12,'#58515c',500,'left',102);
      text(c,amount(item.amount,s.unit),x+73,y+44,17,'#35343d',700,'left',104);
      text(c,item.clock,x+73,y+66,10,'#a19aa3');
    }));
    const completed=time>=Math.max(0,...s.items.map(x=>x.at))+.35;
    if(completed){
      const y=170+rows*100,sum=totals(s,time);
      c.strokeStyle='#66616b';c.lineWidth=1.5;c.beginPath();c.moveTo(18,y);c.lineTo(402,y);c.moveTo(18,y+5);c.lineTo(402,y+5);c.stroke();
      [0,1].forEach(side=>{const x=side?320:100;text(c,'合计',x,y+30,12,'#9a929d',500,'center');text(c,amount(sum[side],s.unit),x,y+62,28,'#30313d',800,'center',185);});
      const diff=Math.abs(Math.round((sum[0]-sum[1])*100)/100);
      text(c,diff?`相差 ${amount(diff,s.unit)}`:'今天也是默契满分的一天',210,y+112,14,'#716576',500,'center',380);
      c.setLineDash([3,4]);c.strokeStyle='#cfc5cd';c.beginPath();c.moveTo(18,y+143);c.lineTo(402,y+143);c.stroke();c.setLineDash([]);
      text(c,s.footer,210,y+177,11,'#8f8593',500,'center',378);
      lastY=height;
    }
    return {paper,height,revealed:lastY,completed};
  }
  let receiptKey='',cachedReceipt;
  function receipt(c,s,time) {
    const key=`${s.items.filter(x=>x.at<=time).map(x=>x.id).join('|')}:${time>=Math.max(0,...s.items.map(x=>x.at))+.35}`;
    // Rebuilt only when the reveal set changes; caller invalidates on edits.
    if(key!==receiptKey){receiptKey=key;cachedReceipt=receiptLayer(s,time);}
    const {paper,revealed,completed}=cachedReceipt;
    const entries=visibleItems(s,time),latest=Math.max(0,...entries.map(x=>x.at));
    let previous=155;
    for(const side of [0,1]) {
      s.items.filter(x=>x.side===side).sort((a,b)=>a.at-b.at).forEach((item,i)=>{
        if(item.at<latest)previous=Math.max(previous,168+i*100+95);
      });
    }
    const beforeSummary=170+Math.max(1,...[0,1].map(side=>s.items.filter(x=>x.side===side).length))*100;
    const feed=completed?beforeSummary+(revealed-beforeSummary)*clamp((time-latest-.35)/.12,0,1)
      :previous+(revealed-previous)*clamp((time-latest)/.28,0,1);
    const printProgress=clamp(time/.7,0,1),bottom=755;
    const drawHeight=Math.min(544,feed*printProgress),offset=Math.max(0,feed-544);
    c.save();c.beginPath();c.rect(60,205,420,550);c.clip();
    c.shadowColor='#57455725';c.shadowBlur=18;c.shadowOffsetY=5;
    c.drawImage(paper,0,offset*2,840,drawHeight*2,60,bottom-drawHeight,420,drawHeight);
    c.restore();
    // Printer body covers the paper exit, giving a clean feed line.
    round(c,50,746,440,17,8,'#273343');
    const gradient=c.createLinearGradient(0,760,0,890);gradient.addColorStop(0,'#fff');gradient.addColorStop(1,'#dce3ee');
    round(c,30,762,480,128,36,gradient);round(c,58,785,168,76,20,'#273343');round(c,314,785,168,76,20,'#273343');
    const sum=totals(s,time);
    [0,1].forEach(side=>{
      const x=side?330:73;
      text(c,s.people[side].name,x,805,12,'#b6c0d2',500,'left',128);
      text(c,amount(sum[side],s.unit),x,835,25,'#f4c778',800,'left',139);
    });
    c.fillStyle='#31394d';[256,284].forEach(x=>{c.beginPath();c.ellipse(x,818,4,7,0,0,7);c.fill();});
    round(c,264,833,12,7,4,'#dba0b9');c.fillStyle='#9ed8c7';c.beginPath();c.arc(270,784,4,0,7);c.fill();
    round(c,78,889,45,10,4,'#344253');round(c,416,889,45,10,4,'#344253');
    text(c,'喵喵记账 · 今日小票',270,929,14,'#786b87',600,'center');
  }
  return {
    invalidate(){receiptKey='';cachedReceipt=null;},
    draw(canvas,s,time){
      const c=canvas.getContext('2d');c.setTransform(canvas.width/540,0,0,canvas.height/960,0,0);
      c.clearRect(0,0,540,960);background(c,s);header(c,s,time);
      project.variant==='receipt'?receipt(c,s,time):board(c,s,time);
    },
    fullReceipt(s) {return receiptLayer(s,s.duration).paper;},
  };
}
