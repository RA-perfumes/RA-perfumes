(() => {
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
    // A single paused film follows the scroll. All seeks are coalesced.
    const hero=$('.hero'),stage=$('.hero-stage'),video=$('#scrub-video'),bands=$$('.band');
    const gates=['(prefers-reduced-motion: reduce)'];
    const queries=gates.map(q=>matchMedia(q));
    let scrubOn=false,started=false,ready=false,failed=false,raf=null,target=0,shown=0,lastTick=0,visible=true,seeking=false,pending=null,seekTimer=null,lastChapter='',lastProgress=-1,lastScale=-1,blobURL=null,loadController=null;
    const cache=bands.map(()=>({o:-1,k:-1,active:null}));
    function heroProgress(){return clamp(-hero.getBoundingClientRect().top/Math.max(1,hero.offsetHeight-innerHeight))}
    function renderBands(p){const ramp=.035;let active=0;bands.forEach((b,i)=>{const a=Number(b.dataset.start),z=Number(b.dataset.end);const o=(i===0?1:smooth((p-a)/ramp))*(i===2?1:1-smooth((p-(z-ramp))/ramp));const k=i===0?1:smooth((p-a)/ramp);if(Math.abs(cache[i].o-o)>.005){b.style.opacity=o.toFixed(3);b.style.setProperty("--band-opacity",o.toFixed(3));cache[i].o=o}if(Math.abs(cache[i].k-k)>.005){b.style.setProperty('--k',k.toFixed(3));cache[i].k=k}const on=o>.5;if(on)active=i;if(cache[i].active!==on){b.setAttribute('aria-hidden',String(!on));b.inert=!on;cache[i].active=on}});const chapter=String(active+1).padStart(2,'0');if(chapter!==lastChapter){const label=$('#chapter-number');if(label)label.textContent=chapter;lastChapter=chapter}if(Math.abs(lastProgress-p)>.002){stage.style.setProperty('--progress',p.toFixed(3));lastProgress=p}const scale=1+p*.035;if(Math.abs(lastScale-scale)>.001){stage.style.setProperty('--frame-scale',scale.toFixed(3));lastScale=scale}}
    function releaseSeek(){seeking=false;clearTimeout(seekTimer);if(pending!==null){const n=pending;pending=null;requestSeek(n)}}
    function requestSeek(t){if(!ready||!Number.isFinite(video.duration)||!scrubOn)return;t=clamp(t,0,Math.max(0,video.duration-.04));if(seeking){pending=t;return}if(Math.abs(video.currentTime-t)<.018)return;seeking=true;try{video.currentTime=t;clearTimeout(seekTimer);seekTimer=setTimeout(releaseSeek,1200)}catch{seeking=false;pending=null}}
    video.addEventListener('seeked',releaseSeek);
    function stop(){if(raf!==null)cancelAnimationFrame(raf);raf=null;lastTick=0}
    function tick(now){if(!scrubOn||!visible||document.hidden){stop();return}const dt=Math.min(100,now-(lastTick||now-16.667));lastTick=now;shown+=(target-shown)*(1-Math.pow(1-.16,dt/16.667));const settled=Math.abs(target-shown)<.0004;if(settled)shown=target;renderBands(shown);if(ready)requestSeek(shown*video.duration);if(settled){raf=null;lastTick=0}else raf=requestAnimationFrame(tick)}
    function scroll(){if(!scrubOn||hero.closest("main").hidden)return;target=heroProgress();if(raf===null&&visible&&!document.hidden)raf=requestAnimationFrame(tick)}
    function failVideo(){failed=true;ready=false;seeking=false;pending=null;clearTimeout(seekTimer);stage.classList.remove('is-loading','video-ready');video.removeAttribute('src');stage.classList.add('video-failed');applyMode()}
    video.addEventListener('error',failVideo);
    function loadVideo(){
 if(started)return;
 started=true;
 video.defaultMuted=true;
 video.muted=true;
 video.addEventListener('loadeddata',()=>{
   ready=true;
   stage.classList.add('video-ready');
   scroll();
 },{once:true});
 
 video.load();
}
function applyMode(){const on=!queries.some(q=>q.matches)&&!failed;document.body.classList.toggle('static-hero',!on);if(on){if(!scrubOn){scrubOn=true;addEventListener('scroll',scroll,{passive:true});cache.forEach(c=>{c.o=-1;c.k=-1;c.active=null});loadVideo()}target=heroProgress();shown=target;renderBands(shown);scroll()}else{scrubOn=false;removeEventListener('scroll',scroll);stop();bands.forEach((b,i)=>{b.style.opacity=i===0?'1':'0';b.style.setProperty('--k','1');b.inert=i!==0;b.setAttribute('aria-hidden',String(i!==0))});stage.style.setProperty('--frame-scale','1');stage.style.setProperty('--progress','0');video.pause()}}
    queries.forEach(q=>q.addEventListener('change',applyMode));addEventListener('resize',scroll,{passive:true});
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)scroll();else stop()},{threshold:0}).observe(hero);
    document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('paused',document.hidden);if(document.hidden){stop()}else scroll()});
    addEventListener('pagehide',()=>{if(blobURL)URL.revokeObjectURL(blobURL)});
    applyMode();
})();