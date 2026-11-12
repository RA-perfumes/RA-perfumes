(() => {
 const list=document.querySelector('.house-collection');
 const observer=new ResizeObserver(entries=>entries.forEach(({target})=>fit(target)));
 function fit(title){
   const name=title.querySelector('.fragrance-name');
   const volume=title.querySelector('.bottle-volume');
   if(!name || !title.clientWidth)return;
   const style=getComputedStyle(title);
   const base=parseFloat(style.fontSize);
   const available=title.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-parseFloat(style.columnGap)-volume.getBoundingClientRect().width-2;
   name.style.fontSize=base+'px';
   const range=document.createRange();
   range.selectNodeContents(name);
   const width=range.getBoundingClientRect().width;
   if(width>available && available>0)name.style.fontSize=(base*available/width)+'px';
 }
 function update(){
   list.querySelectorAll('h3').forEach(title=>{
     if(!title.querySelector('.bottle-volume')){
       const parts=title.textContent.trim().match(/^(.*?)\s*·\s*(\d+(?:\.\d+)?\s*ml)$/i);
       if(!parts)return;
       const name=document.createElement('span'),volume=document.createElement('span');
       name.className='fragrance-name';name.textContent=parts[1];
       volume.className='bottle-volume';volume.textContent='· '+parts[2];
       title.replaceChildren(name,volume);observer.observe(title);
     }
     fit(title);
   });
 }
 update();document.fonts.ready.then(update);
 new MutationObserver(update).observe(list,{childList:true,subtree:true});
})();