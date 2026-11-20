export function recordingType() {
  if(typeof MediaRecorder==='undefined')return '';
  return ['video/mp4;codecs=avc1.424028,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'';
}
export async function record({canvas,state,draw,music,signal,progress}) {
  const mimeType=recordingType();
  if(!mimeType||!canvas.captureStream)throw new Error('此浏览器不支持录制，请使用新版 Edge 或 Chrome；仍可保存 PNG');
  const stream=canvas.captureStream(30),chunks=[];
  let audio,source,timer,deadline,frame,recorder,done=false;
  const cleanup=()=>{
    clearTimeout(timer);clearTimeout(deadline);cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());
    try{source?.stop();}catch{}
    audio?.close().catch(()=>{});
  };
  try {
    audio=new AudioContext();
    const dest=audio.createMediaStreamDestination();
    if(music) {
      const decoded=await audio.decodeAudioData(await music.arrayBuffer());
      source=audio.createBufferSource();source.buffer=decoded;source.loop=true;
    } else {
      // A silent audio clock keeps muxed duration stable even during static opening frames.
      source=audio.createConstantSource();source.offset.value=0;
    }
    source.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
    await audio.resume();
    if(signal.aborted)throw new Error('已取消录制');
    recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6_000_000});
    return await new Promise((resolve,reject)=>{
      const abort=()=>{done=true;if(recorder.state!=='inactive')recorder.stop();reject(new Error('已取消录制'));};
      signal.addEventListener('abort',abort,{once:true});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{signal.removeEventListener('abort',abort);done=true;reject(new Error('录制失败，请降低分辨率重试'));};
      recorder.onstop=()=>{
        signal.removeEventListener('abort',abort);
        if(done)return;done=true;
        const blob=new Blob(chunks,{type:mimeType.split(';')[0]});
        blob.size?resolve(blob):reject(new Error('没有录制到画面，请重试'));
      };
      draw(canvas,state,0);recorder.start(250);source?.start();
      const start=performance.now();
      const tick=()=>{
        if(done)return;
        const time=Math.min(state.duration,(performance.now()-start)/1000);
        draw(canvas,state,time);progress(time/state.duration);
        if(time<state.duration)frame=requestAnimationFrame(tick);
        else timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},100);
      };
      tick();
      // Hidden pages can throttle animation; fail explicitly instead of returning an incomplete clip.
      deadline=setTimeout(()=>{if(!done){done=true;signal.removeEventListener('abort',abort);if(recorder.state!=='inactive')recorder.stop();reject(new Error('录制超时，请保持此页面在前台重试'));}},(state.duration+15)*1000);
    });
  } finally {cleanup();}
}
