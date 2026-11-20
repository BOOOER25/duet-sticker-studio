import {project} from './project.js';
import {example,validate,normalize,clamp} from './core.js';
import {imageAsset,cutout,cancelCutout,saveFile} from './media.js';
import {openStore,pack,unpack} from './storage.js';
import {createRenderer} from './draw.js';
import {record,recordingType} from './recorder.js';

const $=s=>document.querySelector(s);
const assets=new Map(),bitmaps=new Map(),urls=new Map();
const renderer=createRenderer(bitmaps);
let state=example(project.variant),store,time=state.duration,playing=false,start=0,frame;
let side=0,pendingImage,saveTimer,toastTimer,recordController,cutoutBusy=false,videoUrl,revision=0,saveQueue=Promise.resolve();
function toast(message) {clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
function node(tag,attrs={},text) {
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)) {
    if(k==='class')n.className=v;
    else if(k==='dataset')Object.assign(n.dataset,v);
    else if(k==='onClick')n.addEventListener('click',v);
    else if(k==='hidden')n.hidden=v;
    else n.setAttribute(k,v);
  }
  if(text!==undefined)n.textContent=text;
  return n;
}
function field(label,value,change,attrs={}) {
  const wrap=node('label',{},label),input=node('input',attrs);input.value=value;
  input.addEventListener('change',()=>change(input.value));wrap.append(input);return wrap;
}
function assetOptions(value,change) {
  const label=node('label',{},'图片素材'),select=node('select');
  select.append(node('option',{value:''},'暂不选择'));
  for(const a of assets.values())if(a.kind==='image')select.append(node('option',{value:a.id},a.name));
  select.value=value;select.addEventListener('change',()=>change(select.value));label.append(select);return label;
}
function url(id) {
  if(!assets.has(id))return '';
  if(!urls.has(id))urls.set(id,URL.createObjectURL(assets.get(id).blob));
  return urls.get(id);
}
async function addAsset(a) {
  if(assets.size>=100)throw new Error('素材库最多 100 项，请先移除不用的素材');
  const bitmap=a.kind==='image'?await createImageBitmap(a.blob):null;
  assets.set(a.id,a);if(bitmap)bitmaps.set(a.id,bitmap);return a.id;
}
function releaseAll() {
  for(const b of bitmaps.values())b.close();
  for(const u of urls.values())URL.revokeObjectURL(u);
  bitmaps.clear();urls.clear();assets.clear();
}
function pause() {playing=false;cancelAnimationFrame(frame);$('#play').textContent='▶';$('#play').setAttribute('aria-label','播放动画');}
function render() {
  renderer.draw($('#preview'),state,time);$('#seek').max=state.duration;$('#seek').value=time;
  $('#clock').textContent=`${time.toFixed(1)} / ${state.duration.toFixed(1)} s`;
}
function saveDraft() {
  if(!store)return;
  clearTimeout(saveTimer);const version=revision;$('#save-state').textContent='正在保存…';
  saveTimer=setTimeout(()=>{
    const snapshot=structuredClone(state),copy=new Map(assets);
    saveQueue=saveQueue.catch(()=>{}).then(()=>store.put(snapshot,copy)).then(()=>{
      if(version===revision)$('#save-state').textContent='已保存到本机';
    }).catch(()=>{if(version===revision)$('#save-state').textContent='保存失败，请导出项目';});
  },300);
}
function changed({end=false}={}) {
  revision++;pause();renderer.invalidate();time=end?state.duration:clamp(time,0,state.duration);render();saveDraft();
}
function edit(change,{refresh=false,end=false}={}) {
  const previous=structuredClone(state);
  try {change();validate(state);changed({end});if(refresh)sync();}
  catch(e){state=previous;toast(e.message);sync();render();}
}
function syncScene() {
  for(const key of ['title','footer','unit','duration','theme'])$('#'+key).value=state[key];
  $('#music-status').textContent=assets.has(state.music)?`已添加：${assets.get(state.music).name}`:'未添加背景音乐，导出为无声视频。';
  $('#people').replaceChildren(...state.people.map((p,i)=>{
    const card=node('div',{class:'person'}),button=node('button',{class:'avatar-upload','aria-label':`上传${i?'对方':'我的'}头像`,onClick:()=>pickImage(id=>{state.people[i].avatar=id;})});
    if(url(p.avatar))button.append(node('img',{src:url(p.avatar),alt:p.name+'头像'}));else button.textContent=i?'搭':'我';
    card.append(button,field(i?'搭子的名称':'我的名称',p.name,v=>edit(()=>p.name=v),{maxlength:12}));return card;
  }));
}
function syncOrders() {
  const list=state.items.filter(x=>x.side===side);
  $('#side-filter').options[0].textContent=`${state.people[0].name}的明细`;
  $('#side-filter').options[1].textContent=`${state.people[1].name}的明细`;
  $('#orders').replaceChildren(...list.map((item,i)=>{
    const card=node('article',{class:'order',dataset:{id:item.id}}),top=node('div',{class:'order-top'});
    top.append(node('span',{},`ORDER ${String(i+1).padStart(2,'0')}`),node('button',{onClick:()=>edit(()=>{state.items=state.items.filter(x=>x.id!==item.id);},{refresh:true})},'移除'));
    const body=node('div',{class:'order-body'}),image=node('img',{class:'order-thumb',alt:item.name});
    if(url(item.asset))image.src=url(item.asset);
    const info=node('div');info.append(field('商品名称',item.name,v=>edit(()=>item.name=v),{maxlength:20}),
      field(`本笔${state.unit==='元'?'消费金额':state.unit}`,item.amount,v=>edit(()=>item.amount=v),{inputmode:'decimal',maxlength:9}));
    body.append(image,info);
    const grid=node('div',{class:'field-grid'});
    grid.append(field('出现秒数',item.at,v=>edit(()=>item.at=Number(v)),{type:'number',min:0,max:state.duration-.5,step:.1}),
      field('消费时间',item.clock,v=>edit(()=>item.clock=v),{type:'time'}));
    const select=assetOptions(item.asset,v=>edit(()=>item.asset=v,{refresh:true}));
    const actions=node('div',{class:'order-actions'});
    actions.append(
      node('button',{onClick:()=>pickImage(id=>{const current=state.items.find(x=>x.id===item.id);if(current)current.asset=id;})},'上传图片'),
      node('button',{onClick:()=>processCutout(item.asset,item.id)},'抠图成贴纸'),
      node('button',{onClick:()=>{const image=assets.get(item.asset);if(image)saveFile(image.blob,'贴纸-'+image.name.replace(/\.[^.]*$/,'')+'.png');else toast('请先选择图片');}},'保存素材'),
    );
    card.append(top,body,grid,select,field('图片大小',item.scale,v=>edit(()=>item.scale=Number(v)),{type:'range',min:.6,max:1.4,step:.05}),actions);
    return card;
  }));
  if(!list.length)$('#orders').append(node('p',{class:'note'},'还没有明细。添加一笔，开始这段故事。'));
  $('#add-item').disabled=list.length>=18;
}
function syncAssets() {
  $('#assets').replaceChildren(...[...assets.values()].filter(a=>a.kind==='image').map(a=>{
    const card=node('article',{class:'asset-card'});
    card.append(node('img',{src:url(a.id),alt:a.name}),node('p',{},a.name),
      node('button',{onClick:()=>processCutout(a.id)},'抠图'),
      node('button',{onClick:()=>saveFile(a.blob,a.name.replace(/\.[^.]*$/,'')+'.png')},'保存 PNG'),
      node('button',{onClick:()=>{
        const refs=[state.background,...state.people.map(p=>p.avatar),...state.items.map(x=>x.asset)];
        if(refs.includes(a.id))return toast('这张素材正在使用，请先在明细或背景中替换');
        bitmaps.get(a.id)?.close();bitmaps.delete(a.id);if(urls.has(a.id))URL.revokeObjectURL(urls.get(a.id));urls.delete(a.id);assets.delete(a.id);changed();sync();
      }},'移除'));
    return card;
  }));
}
function sync(){syncScene();syncOrders();syncAssets();}
function pickImage(apply) {
  if(recordController)return;
  pendingImage=apply;$('#image-picker').value='';$('#image-picker').click();
}
async function processCutout(id,itemId) {
  if(cutoutBusy)return toast('请先等待当前抠图完成');
  const source=assets.get(id);if(!source||source.kind!=='image')return toast('请先选择一张图片');
  cutoutBusy=true;$('#cutout-status').hidden=false;
  const message=m=>$('#cutout-status span').textContent=m;
  message('准备抠图…');
  // Open the asset panel so progress and cancellation are always reachable.
  selectTab('assets');
  try {
    const blob=await cutout(source.blob,message);
    const a={id:crypto.randomUUID(),name:source.name.replace(/\.[^.]*$/,'')+'-抠图.png',kind:'image',blob};
    await addAsset(a);
    const item=state.items.find(x=>x.id===itemId);if(item)item.asset=a.id;
    changed();sync();toast('抠图完成，透明贴纸已加入素材库');
  }catch(e){toast(e.message);}
  finally{cutoutBusy=false;$('#cutout-status').hidden=true;}
}
function selectTab(name) {
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));
  for(const key of ['scene','orders','assets'])$('#panel-'+key).hidden=key!==name;
}
function play() {
  if(recordController)return;
  if(playing)return pause();
  if(time>=state.duration)time=0;
  playing=true;start=performance.now()-time*1000;$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','暂停动画');
  const tick=()=>{time=Math.min(state.duration,(performance.now()-start)/1000);render();if(time>=state.duration)pause();else frame=requestAnimationFrame(tick);};
  tick();
}
function lock(locked) {
  document.body.classList.toggle('busy',locked);$('#record-badge').hidden=!locked;$('#cancel-record').hidden=!locked;
  for(const id of ['record','play','seek','resolution','save-png','save-receipt','import-project','export-project'])$('#'+id).disabled=locked;
}
async function recordVideo() {
  if(recordController||cutoutBusy)return toast('请先等待当前处理完成');
  try{validate(state);}catch(e){return toast(e.message);}
  pause();recordController=new AbortController();const controller=recordController;lock(true);
  const target=document.createElement('canvas');target.width=Number($('#resolution').value);target.height=target.width*16/9;
  try {
    const blob=await record({canvas:target,state:structuredClone(state),draw:(c,s,t)=>{
      renderer.draw(c,s,t);time=t;render();
    },music:assets.get(state.music)?.blob,signal:controller.signal,progress:p=>{$('#record').textContent=`录制中 ${Math.round(p*100)}%`;}});
    if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(blob);
    $('#result-player').src=videoUrl;$('#video-download').href=videoUrl;
    const name=`${project.id}-${new Date().toISOString().replace(/[:.]/g,'-')}.${blob.type==='video/mp4'?'mp4':'webm'}`;
    $('#video-download').download=name;$('#video-download').textContent=`下载 ${blob.type==='video/mp4'?'MP4':'WebM'} 视频（${(blob.size/1024/1024).toFixed(1)} MB）`;
    $('#video-result').hidden=false;await saveFile(blob,name);toast('录制完成，可以预览或下载视频');
  }catch(e){toast(e.message);}
  finally{recordController=null;lock(false);$('#record').textContent='录制视频';time=state.duration;renderer.invalidate();render();}
}
async function png(canvas,name) {
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('图片导出失败');await saveFile(blob,name);
}
async function replaceProject(next) {
  // Decode completely before replacing the current draft.
  const decoded=new Map();
  try{
    let pixels=0;
    for(const a of next.assets.values())if(a.kind==='image'){
      const bitmap=await createImageBitmap(a.blob);
      pixels+=bitmap.width*bitmap.height;
      if(bitmap.width>1400||bitmap.height>1400||pixels>40e6){bitmap.close();throw new Error('素材解码尺寸过大');}
      decoded.set(a.id,bitmap);
    }
  }
  catch(e){for(const b of decoded.values())b.close();throw new Error('项目内有损坏的图片，已保留当前内容');}
  pause();releaseAll();state=next.state;
  for(const [id,a] of next.assets)assets.set(id,a);for(const [id,b] of decoded)bitmaps.set(id,b);
  changed({end:true});sync();
}
async function loadExample() {
  const next=example(project.variant),library=new Map();
  const records=await Promise.all([0,1,2,3].map(async i=>{
    const response=await fetch(`./sample-${i}.png`);if(!response.ok)throw new Error('示例图片加载失败');
    return {id:`sample-${i}`,name:['披萨.png','饮品.png','披萨贴纸.png','咖啡.png'][i],kind:'image',blob:await response.blob()};
  }));
  records.forEach(a=>library.set(a.id,a));await replaceProject({state:next,assets:library});
}
async function init() {
  document.title=project.title+' · 喵喵创作室';$('#project-title').textContent=project.title;$('#project-subtitle').textContent=project.subtitle;$('#project-number').textContent=project.variant==='receipt'?'No. 02':'No. 01';
  $('#save-receipt').hidden=project.variant!=='receipt';
  const type=recordingType();$('#record-help').textContent=type?`录制为 ${type.startsWith('video/mp4')?'MP4':'WebM'} · 30 fps。按配置时长实时录制，请保持页面在前台。`:'当前浏览器不支持录制，可保存 PNG 或换用新版 Edge / Chrome。';
  if(!type)$('#record').disabled=true;
  try {
    store=await openStore(project.id);const saved=await store.get();
    if(saved?.state) {await replaceProject({state:normalize(saved.state),assets:new Map(saved.assets.map(a=>[a.id,a]))});toast('已恢复本机保存的项目');}
    else await loadExample();
  }catch(e){
    $('#save-state').textContent='本机保存暂不可用';toast('自动恢复失败，可导入项目继续；'+e.message);
    try{await loadExample();}catch{for(const item of state.items)item.asset='';changed({end:true});sync();}
  }
  render();
}

document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.tab)));
for(const key of ['title','footer','unit','theme'])$('#'+key).addEventListener('change',e=>edit(()=>state[key]=e.target.value,{refresh:true}));
$('#duration').addEventListener('change',e=>edit(()=>{
  const next=Number(e.target.value),ratio=(next-.8)/(state.duration-.8);
  for(const item of state.items)item.at=Math.round(item.at*ratio*10)/10;
  state.duration=next;
},{refresh:true,end:true}));
$('#play').addEventListener('click',play);
$('#seek').addEventListener('input',e=>{pause();time=Number(e.target.value);render();});
$('#side-filter').addEventListener('change',e=>{side=Number(e.target.value);syncOrders();});
$('#add-item').addEventListener('click',()=>edit(()=>{
  state.items.push({id:crypto.randomUUID(),side,name:'新的一笔',amount:'0',clock:'12:00',at:Math.min(state.duration-1,1+state.items.length*.4),asset:'',scale:1});
},{refresh:true,end:true}));
$('#image-picker').addEventListener('change',async e=>{
  const file=e.target.files[0],apply=pendingImage;if(!file||!apply)return;
  try{const id=await addAsset(await imageAsset(file));apply(id);changed();sync();toast('图片已加入素材库');}catch(e){toast(e.message);}
});
$('#upload-bg').addEventListener('click',()=>pickImage(id=>state.background=id));
$('#clear-bg').addEventListener('click',()=>edit(()=>state.background=''));
$('#upload-assets').addEventListener('click',()=>$('#assets-picker').click());
$('#assets-picker').addEventListener('change',async e=>{
  const files=[...e.target.files];let loaded=0;
  for(const file of files){try{await addAsset(await imageAsset(file));loaded++;}catch(e){toast(e.message);break;}}
  e.target.value='';if(loaded){changed();sync();toast(`已添加 ${loaded} 张素材`);}
});
$('#cancel-cutout').addEventListener('click',cancelCutout);
$('#upload-music').addEventListener('click',()=>$('#music-picker').click());
$('#clear-music').addEventListener('click',()=>edit(()=>{assets.delete(state.music);state.music='';},{refresh:true}));
$('#music-picker').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    if(file.size>20*1024*1024)throw new Error('音乐不能超过 20 MB');
    if(!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/webm','audio/aac'].includes(file.type))throw new Error('请选择 MP3、WAV、OGG 或 M4A 音频');
    const audio=new AudioContext();try{await audio.decodeAudioData(await file.arrayBuffer());}finally{await audio.close();}
    assets.delete(state.music);
    const id=await addAsset({id:crypto.randomUUID(),name:file.name,blob:file,kind:'audio'});edit(()=>state.music=id,{refresh:true});
  }catch(e){toast('无法读取音乐：'+e.message);}
});
$('#save-png').addEventListener('click',()=>png($('#preview'),project.id+'.png').catch(e=>toast(e.message)));
$('#save-receipt').addEventListener('click',()=>png(renderer.fullReceipt(state),'双人完整小票.png').catch(e=>toast(e.message)));
$('#record').addEventListener('click',recordVideo);
$('#cancel-record').addEventListener('click',()=>recordController?.abort());
$('#export-project').addEventListener('click',async()=>{
  try{validate(state);const blob=await pack(state,assets);if(blob.size>80*1024*1024)throw new Error('项目超过 80 MB，请移除不用的素材');await saveFile(blob,project.id+'-项目.json');toast('项目已导出，包含配置和素材');}catch(e){toast(e.message);}
});
$('#import-project').addEventListener('click',()=>{if(cutoutBusy)return toast('请先取消或完成抠图');$('#project-picker').click();});
$('#project-picker').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{await replaceProject(await unpack(file));toast('项目已导入并保存在本机');}catch(e){toast(e.message);}
});
$('#reset').addEventListener('click',async()=>{
  if(cutoutBusy)return toast('请先取消或完成抠图');
  if(!confirm('重新载入示例会替换当前配置和素材。需要保留时，请先导出项目。'))return;
  try{await loadExample();toast('已载入示例');}catch(e){toast(e.message);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(recordController){recordController.abort();toast('页面进入后台，录制已取消，请保持前台重试');}}});
window.addEventListener('pagehide',()=>{cancelCutout();recordController?.abort();});
init().catch(e=>{$('#fatal').hidden=false;$('#fatal').textContent='页面初始化失败：'+e.message;});
