const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export async function imageAsset(file, name = file.name) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('图片支持 JPG、PNG、WebP');
  if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB');
  const source = await createImageBitmap(file);
  try {
    if (source.width * source.height > 40e6) throw new Error('图片像素过大，请压缩后重试');
    const ratio = Math.min(1, 1400 / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * ratio)); canvas.height = Math.max(1, Math.round(source.height * ratio));
    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return {id: crypto.randomUUID(), name: String(name).slice(0, 80), blob, kind: 'image'};
  } finally { source.close(); }
}
export async function trim(blob) {
  const bitmap = await createImageBitmap(blob), c = document.createElement('canvas');
  c.width = bitmap.width; c.height = bitmap.height;
  const ctx = c.getContext('2d', {willReadFrequently: true}); ctx.drawImage(bitmap, 0, 0); bitmap.close();
  const {data} = ctx.getImageData(0, 0, c.width, c.height);
  let l=c.width, t=c.height, r=-1, b=-1;
  for (let y=0;y<c.height;y++) for(let x=0;x<c.width;x++) if(data[(y*c.width+x)*4+3]>12) {l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
  if (r < 0) throw new Error('没有识别到主体，请更换图片或上传透明 PNG');
  const result = document.createElement('canvas'); result.width=r-l+1; result.height=b-t+1;
  result.getContext('2d').drawImage(c,l,t,result.width,result.height,0,0,result.width,result.height);
  return new Promise(resolve=>result.toBlob(resolve,'image/png'));
}
let worker, active, counter=0;
export function cancelCutout() {
  worker?.terminate(); worker=null;
  if(active) {clearTimeout(active.timer);active.reject(new Error('已取消抠图'));active=null;}
}
export async function cutout(blob, progress) {
  if (active) throw new Error('另一张图片正在抠图，请稍候');
  if (!worker) {
    worker = new Worker(new URL('./cutout-worker.js', import.meta.url), {type:'module'});
    worker.onmessage=({data})=>{
      if(!active||data.id!==active.id)return;
      if(data.type==='progress')return active.progress(data.message);
      const task=active;active=null;clearTimeout(task.timer);
      data.type==='done'?task.resolve(data.blob):task.reject(new Error(data.message));
    };
    worker.onerror=()=>cancelCutout();
  }
  const id=++counter;
  const result=await new Promise((resolve,reject)=>{
    active={id,resolve,reject,progress,timer:setTimeout(()=>cancelCutout(),240000)};
    worker.postMessage({id,blob});
  });
  return trim(result);
}
export async function saveFile(blob, name) {
  const file=new File([blob], name, {type:blob.type});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  return file;
}
