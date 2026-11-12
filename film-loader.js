/* Assemble the exact uploaded RA film from byte-identical cached static parts.
 * Existing video plays as fallback until the complete cinematic film is ready. */
(()=>{
  'use strict';
  const video=document.querySelector('#scrub-video');
  if(!video)return;
  const urls=Array.from({length:20},(_,i)=>'assets/film-chunks/part-'+String(i).padStart(2,'0')+'.bin');
  Promise.all(urls.map(async(url)=>{
    const response=await fetch(url,{cache:'force-cache'});
    if(!response.ok)throw new Error('Film part unavailable');
    return response.arrayBuffer();
  })).then(parts=>{
    if(parts.reduce((total,part)=>total+part.byteLength,0)!==7625193)return;
    const url=URL.createObjectURL(new Blob(parts,{type:'video/mp4'}));
    video.addEventListener('loadeddata',()=>window.dispatchEvent(new Event('scroll')),{once:true});
    video.src=url;
    video.load();
    window.addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});
  }).catch(()=>{/* Keep the existing film without interrupting the page. */});
})();