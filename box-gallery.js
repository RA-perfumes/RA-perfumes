/* RA Perfumes — two-box cinematic showcase. Native horizontal swipe, no visible counts. */
(() => {
  'use strict';
  const showcase=document.querySelector('#box-showcase');
  if(!showcase)return;
  const track=showcase.querySelector('#box-gallery-track');
  const photos=[...track.querySelectorAll('img')];
  const dots=[...showcase.querySelectorAll('[data-box-to]')];
  const arrows=[...showcase.querySelectorAll('[data-box-step]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(photos.length<2)return;
  let current=0,scrollFrame=0,visible=false,lastInteraction=0;
  function mark(index){
    current=Math.max(0,Math.min(photos.length-1,index));
    dots.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===current)));
  }
  function go(index,manual=false){
    if(manual)lastInteraction=Date.now();
    const next=(index+photos.length)%photos.length;
    mark(next);
    track.scrollTo({left:next*track.clientWidth,behavior:reduced.matches?'instant':'smooth'});
  }
  arrows.forEach(button=>button.addEventListener('click',()=>{
    go(current+Number(button.dataset.boxStep),true);
  }));
  dots.forEach(button=>button.addEventListener('click',()=>{
    go(Number(button.dataset.boxTo),true);
  }));
  track.addEventListener('touchstart',()=>{lastInteraction=Date.now()},{passive:true});
  track.addEventListener('pointerdown',()=>{lastInteraction=Date.now()},{passive:true});
  track.addEventListener('scroll',()=>{
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(()=>{
      scrollFrame=0;
      if(track.clientWidth)mark(Math.round(track.scrollLeft/track.clientWidth));
    });
  },{passive:true});
  track.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();go(current+(event.key==='ArrowRight'?1:-1),true);
    }
  });
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting},{threshold:.2}).observe(showcase);
  // Advance only when the banner is visible and the user hasn't recently touched the gallery.
  const interval=setInterval(()=>{
    if(!visible||document.hidden||reduced.matches||Date.now()-lastInteraction<14000)return;
    go(current+1);
  },6500);
  addEventListener('resize',()=>{
    if(!track.clientWidth)return;
    track.scrollTo({left:current*track.clientWidth,behavior:'instant'});
  },{passive:true});
  addEventListener('pagehide',()=>clearInterval(interval),{once:true});
  mark(0);
})();