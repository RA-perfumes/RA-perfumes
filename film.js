/* RA Perfumes cinematic journey: stream the film, avoid costly mobile seeking. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const hero=$('.hero'),stage=$('.hero-stage'),video=$('#scrub-video'),bands=$$('.hero .band');
  if(!hero||!stage||!video||!bands.length)return;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
  const reduce=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer: coarse)');
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const cache=bands.map(()=>({o:-1,k:-1,active:null}));
  let mode='static',visible=false,loaded=false,ready=false,broken=false,raf=0;
  let shown=0,target=0,lastTick=0,seeking=false,pending=null,seekTimer=0,pendingTimer=0;
  let lastSeek=0,stalls=0,watchdog=0,usingOriginal=false;
  const constrained=()=>reduce.matches||!!(connection&&(connection.saveData||['slow-2g','2g'].includes(connection.effectiveType)))||(typeof navigator.deviceMemory==='number'&&navigator.deviceMemory<=2);
  const choice=()=>broken||constrained()?'static':coarse.matches||innerWidth<=760?'play':'scrub';
  const progress=()=>clamp(-hero.getBoundingClientRect().top/Math.max(1,hero.offsetHeight-innerHeight));
  const gap=()=>navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4?140:90;
  function render(p){
    const ramp=.045;let active=0;
    bands.forEach((b,i)=>{
      const a=Number(b.dataset.start),z=Number(b.dataset.end);
      const o=(i===0?1:smooth((p-a)/ramp))*(i===bands.length-1?1:1-smooth((p-(z-ramp))/ramp));
      const k=i===0?1:smooth((p-a)/ramp);
      if(Math.abs(cache[i].o-o)>.01){b.style.opacity=o.toFixed(3);cache[i].o=o}
      if(Math.abs(cache[i].k-k)>.015){b.style.setProperty('--k',k.toFixed(3));cache[i].k=k}
      const on=o>.5;if(on)active=i;
      if(cache[i].active!==on){b.setAttribute('aria-hidden',String(!on));b.inert=!on;cache[i].active=on}
    });
    const label=$('#chapter-number'),chapter=String(active+1).padStart(2,'0');
    if(label&&label.textContent!==chapter)label.textContent=chapter;
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;lastTick=0}
  function fail(){
    if(broken)return;
    broken=true;clearTimeout(watchdog);clearTimeout(seekTimer);clearTimeout(pendingTimer);
    seeking=false;pending=null;stage.classList.remove('is-loading','video-ready');stage.classList.add('video-failed');
    try{video.pause();video.removeAttribute('src');video.load()}catch{}
    apply();
  }
  function seek(t){
    if(!ready||mode!=='scrub'||!visible||document.hidden||!Number.isFinite(video.duration))return;
    t=clamp(t,0,Math.max(0,video.duration-.055));
    if(Math.abs(video.currentTime-t)<.09)return;
    if(seeking){pending=t;return}
    const now=performance.now(),delay=gap()-(now-lastSeek);
    if(delay>0){
      pending=t;clearTimeout(pendingTimer);
      pendingTimer=setTimeout(()=>{const latest=pending;pending=null;if(latest!==null)seek(latest)},Math.max(16,delay));
      return;
    }
    seeking=true;lastSeek=now;
    try{
      video.currentTime=t;
      clearTimeout(seekTimer);
      seekTimer=setTimeout(()=>{seeking=false;if(++stalls>=3)fail();else flush()},1100);
    }catch{seeking=false;if(++stalls>=3)fail();else flush()}
  }
  function flush(){
    clearTimeout(seekTimer);
    if(pending!==null&&mode==='scrub'){const latest=pending;pending=null;seek(latest)}
  }
  video.addEventListener('seeked',()=>{seeking=false;stalls=0;flush()});
  video.addEventListener('error',()=>{
    if(!loaded||broken)return;
    if(!usingOriginal){
      usingOriginal=true;
      ready=false;
      stage.classList.remove('video-ready');
      video.src='assets/presence.mp4';
      video.load();
      return;
    }
    fail();
  });
  video.addEventListener('stalled',()=>{if(mode==='play')stage.classList.remove('video-ready')});
  video.addEventListener('playing',()=>{if(mode==='play')stage.classList.add('video-ready')});
  video.addEventListener('loadedmetadata',()=>{
    clearTimeout(watchdog);stage.classList.remove('is-loading');
    if(mode==='scrub'&&video.readyState>=2){ready=true;stage.classList.add('video-ready');seek(shown*video.duration)}
  });
  video.addEventListener('loadeddata',()=>{
    ready=true;clearTimeout(watchdog);stage.classList.remove('is-loading');
    if(mode==='scrub'){stage.classList.add('video-ready');seek(shown*video.duration)}
    else if(mode==='play')play();
  });
  async function play(){
    if(mode!=='play'||!visible||document.hidden||!loaded)return;
    video.loop=true;video.muted=true;video.playsInline=true;
    try{await video.play()}catch{stage.classList.remove('video-ready');if(video.readyState<2)fail()}
  }
  function load(){
    if(loaded||broken||mode==='static'||!visible)return;
    loaded=true;stage.classList.add('is-loading');
    video.preload='auto';video.muted=true;video.playsInline=true;
    // Browser-native streaming supports HTTP ranges and avoids duplicate Blob memory.
    usingOriginal=false;video.src=mode==='play'?'assets/presence-mobile.mp4':'assets/presence-scrub.mp4';video.load();
    watchdog=setTimeout(()=>{stage.classList.remove('is-loading');if(!ready&&mode!=='static')fail()},12000);
  }
  function tick(now){
    raf=0;if(mode==='static'||!visible||document.hidden)return;
    const dt=clamp(now-(lastTick||now-16),0,80);lastTick=now;
    target=progress();shown+=(target-shown)*(1-Math.pow(.76,dt/16.7));
    if(Math.abs(target-shown)<.0006)shown=target;
    render(shown);
    if(mode==='scrub'&&ready)seek(shown*video.duration);
    if(shown!==target)raf=requestAnimationFrame(tick);else lastTick=0;
  }
  function scroll(){if(mode!=='static'&&visible&&!document.hidden&&!raf)raf=requestAnimationFrame(tick)}
  function apply(){
    const next=choice(),changed=next!==mode;mode=next;
    document.body.classList.toggle('static-hero',mode==='static');
    document.body.classList.toggle('low-power-film',mode==='play');
    if(mode==='static'){
      stop();try{video.pause()}catch{}
      clearTimeout(seekTimer);stage.classList.remove('is-loading','video-ready');
      bands.forEach((b,i)=>{b.style.opacity=i?'0':'1';b.style.setProperty('--k','1');b.inert=i!==0;b.setAttribute('aria-hidden',String(i!==0))});
      return;
    }
    if(changed){
      stop();cache.forEach(c=>{c.o=-1;c.k=-1;c.active=null});
      const desired=mode==='play'?'assets/presence-mobile.mp4':'assets/presence-scrub.mp4';
      if(loaded&&!usingOriginal&&video.getAttribute('src')!==desired){
        loaded=false;ready=false;seeking=false;pending=null;
        clearTimeout(seekTimer);clearTimeout(pendingTimer);
        stage.classList.remove('video-ready');
        try{video.pause();video.removeAttribute('src')}catch{}
      }
      if(mode==='scrub'){try{video.pause()}catch{}}
    }
    shown=target=progress();render(shown);
    if(visible){load();if(mode==='play')play();else if(ready)seek(shown*video.duration)}
    scroll();
  }
  addEventListener('scroll',scroll,{passive:true});
  addEventListener('resize',()=>{apply();scroll()},{passive:true});
  if(connection?.addEventListener)connection.addEventListener('change',apply);
  reduce.addEventListener('change',apply);coarse.addEventListener('change',apply);
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(visible){load();if(mode==='play')play();scroll()}
    else{stop();try{video.pause()}catch{}}
  },{threshold:0,rootMargin:'120px 0px'}).observe(hero);
  document.addEventListener('visibilitychange',()=>{
    document.body.classList.toggle('paused',document.hidden);
    if(document.hidden){stop();try{video.pause()}catch{}}
    else{if(mode==='play')play();scroll()}
  });
  addEventListener('pagehide',()=>{stop();clearTimeout(watchdog);clearTimeout(seekTimer);clearTimeout(pendingTimer)});
  apply();
})();
