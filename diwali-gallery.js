/* RA Perfumes — lightweight Diwali two-photo slide. Native swipe, no numbered labels. */
(() => {
  'use strict';
  const root=document.querySelector('#diwali-gallery');
  if(!root)return;
  const track=root.querySelector('#diwali-gallery-track');
  if(!track)return;
  const slides=[...track.querySelectorAll('.diwali-gallery-slide')];
  const dots=[...root.querySelectorAll('[data-diwali-to]')];
  const arrows=[...root.querySelectorAll('[data-diwali-step]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let index=0,frame=0;
  const clamp=v=>Math.max(0,Math.min(slides.length-1,v));
  function mark(n){
    index=clamp(n);
    dots.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    arrows.forEach(button=>{
      const step=Number(button.dataset.diwaliStep);
      button.disabled=(step<0&&index===0)||(step>0&&index===slides.length-1);
    });
  }
  function go(n){
    mark(n);
    track.scrollTo({left:index*track.clientWidth,behavior:reduced.matches?'instant':'smooth'});
  }
  arrows.forEach(button=>button.addEventListener('click',()=>go(index+Number(button.dataset.diwaliStep))));
  dots.forEach(button=>button.addEventListener('click',()=>go(Number(button.dataset.diwaliTo))));
  track.addEventListener('scroll',()=>{
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      if(track.clientWidth)mark(Math.round(track.scrollLeft/track.clientWidth));
    });
  },{passive:true});
  track.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();go(index+(event.key==='ArrowRight'?1:-1));
    }
  });
  addEventListener('resize',()=>{
    track.scrollTo({left:index*track.clientWidth,behavior:'instant'});
  },{passive:true});
  mark(0);
})();