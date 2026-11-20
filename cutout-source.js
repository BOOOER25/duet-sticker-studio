import {removeBackground} from '@imgly/background-removal';
self.onmessage=async({data:{id,blob}})=>{
  try {
    self.postMessage({id,type:'progress',message:'首次加载约 40 MB 模型，图片在本机处理…'});
    const result=await removeBackground(blob,{
      model:'isnet_quint8',device:'cpu',proxyToWorker:false,
      output:{format:'image/png',type:'foreground'},
      progress:(_key,current,total)=>self.postMessage({id,type:'progress',message:current<total?`下载抠图资源 ${Math.round(current/total*100)}%`:'正在识别主体轮廓…'}),
    });
    self.postMessage({id,type:'done',blob:result});
  } catch {
    self.postMessage({id,type:'error',message:'抠图失败，可重试或上传已抠好的透明 PNG'});
  }
};
