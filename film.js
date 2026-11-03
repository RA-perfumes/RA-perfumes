/* RA PERFUMES — smooth cinematic hero.
   Native video playback. Scroll affects text, never video time. */
(() => {
  'use strict';
  const hero=document.querySelector('.hero');
  const stage=document.querySelector('.hero-stage');
  const video=document.querySelector('#scrub-video');
  const bands=[...document.querySelectorAll('.hero .band')];
  if(!hero||!stage||!video||bands.length===0)return;

  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const mobile=matchMedia('(max-width: 900px), (pointer: coarse)');
  const network=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n)};
  const lowResource=()=>reducedMotion.matches||
    !!(network&&(network.saveData||['slow-2g','2g'].includes(network.effectiveType)))||
    (typeof navigator.deviceMemory==='number'&&navigator.deviceMemory<=2);

  let visible=false,started=false,failed=false,triedOriginal=false,frame=0,lastP=-1;
  function draw(){
    frame=0;
    if(lowResource())return;
    const length=Math.max(1,hero.offsetHeight-innerHeight);
    const p=clamp(-hero.getBoundingClientRect().top/length);
    if(Math.abs(p-lastP)<.001)return;
    lastP=p;
    const fade=.075;
    let active=0;
    bands.forEach((band,i)=>{
      const start=Number(band.dataset.start),end=Number(band.dataset.end);
      const entering=i===0?1:smooth((p-start)/fade);
      const exiting=i===bands.length-1?1:1-smooth((p-(end-fade))/fade);
      const opacity=clamp(entering*exiting);
      band.style.opacity=opacity.toFixed(3);
      band.style.setProperty('--k',smooth((p-start)/fade).toFixed(3));
      const showing=opacity>.48;
      if(showing)active=i;
      band.inert=!showing;
      band.setAttribute('aria-hidden',String(!showing));
    });
    const chapter=document.querySelector('#chapter-number');
    if(chapter)chapter.textContent=String(active+1).padStart(2,'0');
  }
  function queue(){
    if(!frame&&!lowResource())frame=requestAnimationFrame(draw);
  }
  function useStill(){
    stage.classList.remove('is-loading','video-ready');
    stage.classList.add('video-failed');
    try{video.pause()}catch{}
  }
  function load(){
    if(started||failed||!visible||lowResource())return;
    started=true;
    stage.classList.add('is-loading');
    video.muted=true;video.defaultMuted=true;video.playsInline=true;video.loop=false;
    video.preload='auto';
    video.src=mobile.matches?'assets/presence-mobile.mp4':'assets/presence-scrub.mp4';
    video.load();
  }
  function resume(){
    if(!visible||document.hidden||lowResource()||failed)return;
    if(!started){load();return}
    if(!video.paused)return;
    const promise=video.play();
    if(promise&&typeof promise.catch==='function')
      promise.catch(()=>{stage.classList.remove('is-loading','video-ready')});
  }
  video.addEventListener('loadeddata',()=>{
    stage.classList.remove('is-loading');
    resume();
  });
  video.addEventListener('playing',()=>{
    stage.classList.remove('is-loading','video-failed');
    stage.classList.add('video-ready');
  });
  video.addEventListener('waiting',()=>{
    stage.classList.remove('is-loading');
  });
  video.addEventListener('error',()=>{
    if(!started||failed)return;
    if(!triedOriginal){
      triedOriginal=true;
      video.src='assets/presence.mp4';video.load();
      return;
    }
    failed=true;useStill();
  });

  const observer=new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    if(visible){queue();resume()}
    else if(started){try{video.pause()}catch{}}
  },{rootMargin:'150px 0px',threshold:0});
  observer.observe(hero);
  addEventListener('scroll',queue,{passive:true});
  addEventListener('resize',queue,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    document.body.classList.toggle('paused',document.hidden);
    if(document.hidden){try{video.pause()}catch{}}
    else resume();
  });
  function changePreference(){
    const staticMode=lowResource();
    document.body.classList.toggle('static-hero',staticMode);
    if(staticMode){
      if(started){try{video.pause()}catch{}}
      stage.classList.remove('video-ready','is-loading');
      bands.forEach((band,i)=>{
        band.style.opacity=i===0?'1':'0';
        band.style.setProperty('--k','1');
        band.inert=i!==0;
        band.setAttribute('aria-hidden',String(i!==0));
      });
    }else{
      lastP=-1;queue();if(visible)resume();
    }
  }
  reducedMotion.addEventListener('change',changePreference);
  if(network&&typeof network.addEventListener==='function')
    network.addEventListener('change',changePreference);
  changePreference();
  addEventListener('pagehide',()=>{
    observer.disconnect();
    if(frame)cancelAnimationFrame(frame);
    try{video.pause()}catch{}
  },{once:true});
})();