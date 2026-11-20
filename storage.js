import {normalize} from './core.js';
const request = req => new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export async function openStore(id) {
  const req=indexedDB.open(id,1);req.onupgradeneeded=()=>req.result.createObjectStore('data');
  const db=await request(req);
  return {
    async get() {return request(db.transaction('data').objectStore('data').get('draft'));},
    async put(state,assets) {
      const tx=db.transaction('data','readwrite');tx.objectStore('data').put({state,assets:[...assets.values()]},'draft');
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    },
  };
}
export async function pack(state, assets) {
  const records=await Promise.all([...assets.values()].map(async a=>({
    id:a.id,name:a.name,kind:a.kind,
    data:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(a.blob);}),
  })));
  return new Blob([JSON.stringify({format:'duet-studio',state,assets:records})],{type:'application/json'});
}
export async function unpack(file) {
  if(file.size>80*1024*1024)throw new Error('项目文件不能超过 80 MB');
  const raw=JSON.parse(await file.text());
  if(raw.format!=='duet-studio'||!Array.isArray(raw.assets)||raw.assets.length>100)throw new Error('不是有效的双人素材项目文件');
  const state=normalize(raw.state),assets=new Map();
  for(const a of raw.assets) {
    if(typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(a.id)||assets.has(a.id))throw new Error('素材编号无效或重复');
    if(typeof a.data!=='string'||!/^data:(image\/(?:png|jpeg|webp)|audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|webm|aac));base64,[A-Za-z0-9+/=]+$/.test(a.data))throw new Error('素材格式无效，仅支持图片和音频');
    const blob=await(await fetch(a.data)).blob();
    if(blob.size>20*1024*1024)throw new Error('素材超过 20 MB');
    assets.set(a.id,{id:a.id,name:String(a.name||'素材').slice(0,80),kind:blob.type.startsWith('image/')?'image':'audio',blob});
  }
  const refs=[state.background,state.music,...state.people.map(p=>p.avatar),...state.items.map(x=>x.asset)].filter(Boolean);
  if(refs.some(id=>!assets.has(id)))throw new Error('项目文件缺少引用的素材');
  if(state.music&&assets.get(state.music).kind!=='audio')throw new Error('背景音乐格式无效');
  if([state.background,...state.people.map(p=>p.avatar),...state.items.map(x=>x.asset)].filter(Boolean).some(id=>assets.get(id).kind!=='image'))throw new Error('图片素材格式无效');
  return {state,assets};
}
