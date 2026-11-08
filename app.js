(() => {
  'use strict';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const bottleControl='<span class="arrow-disc perfume-disc" aria-hidden="true"><svg class="perfume-icon" viewBox="0 0 32 36" fill="none" aria-hidden="true"><rect x="11" y="3" width="10" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M13 8v4m6-4v4" stroke="currentColor" stroke-width="1.3"/><rect x="6" y="12" width="20" height="21" rx="5" stroke="currentColor" stroke-width="1.3"/><path d="M10 16v10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><path d="m16 19 3 4-3 4-3-4 3-4Z" fill="currentColor" opacity=".65"/></svg></span>';
  const prices={30:399,50:599,100:1299};
  const originalPrices={30:499,50:999,100:999*1.75};
  const formatPrice=value=>'₹'+value.toLocaleString('en-IN');
  // Contact details stay local until Continue opens the business WhatsApp chat.
  const WHATSAPP_NUMBER='918939429631';
  const products={
    discovery:{name:'Discovery Set',image:'assets/discovery-set-new.jpg',story:'Explore all three signatures in one set: ILAVEYIL, IRAVÉ and French Rose Oud. Three 10 ml perfumes.',description:'ILAVEYIL · IRAVÉ · French Rose Oud · 3 × 10 ml'},
    fresh:{name:'ILAVEYIL',image:'assets/ilaveyil-new.jpg',moodImage:'assets/ilaveyil-new.jpg',moodAlt:'ILAVEYIL perfume in warm morning light',inspiration:'Sweet lime',description:'Sweet-lime freshness that captures the feeling of a new morning.',story:'Sweet-lime freshness that captures the feeling of a new morning.',quote:'Sweet-lime freshness that captures the feeling of a new morning.'},
    arena:{name:'IRAVÉ',image:'assets/irave-new.jpg',moodImage:'assets/irave-new.jpg',moodAlt:'IRAVÉ perfume in a soft evening glow',inspiration:'Soft sweetness',description:'A soft sweetness that unfolds into warmth as evening settles.',story:'A soft sweetness that unfolds into warmth as evening settles.',quote:'A soft sweetness that unfolds into warmth as evening settles.'},
    oud:{name:'French Rose Oud',image:'assets/french-rose-oud-new.jpg',moodImage:'assets/french-rose-oud-new.jpg',moodAlt:'French Rose Oud perfume beside a rose and warm oud wood',inspiration:'Rose & oud',description:'Soft rose petals unfolding into the rich warmth of oud.',story:'Soft rose petals unfolding into the rich warmth of oud.',quote:'Soft rose petals unfolding into the rich warmth of oud.'}
  };
  const productDialog=$('#product-dialog'),bagDialog=$('#bag-dialog');
  let bag=[],currentProduct='fresh',currentSize=50,toastTimer,orderMessage='';
  const focusOrigins=new WeakMap();
  try{
    const saved=JSON.parse(localStorage.getItem('ra-presence-selection')||'[]');
    if(Array.isArray(saved))bag=saved.filter(item=>item&&Object.hasOwn(products,item.id)&&Object.hasOwn(prices,item.size)&&(item.id!=='discovery'||Number(item.size)===30)&&Number.isInteger(item.qty)&&item.qty>0&&item.qty<=99).map(item=>({id:item.id,size:Number(item.size),qty:item.qty}));
  }catch{}
  const itemCount=()=>bag.reduce((sum,item)=>sum+item.qty,0);
  const itemPrice=item=>item.id==='discovery'?199:prices[item.size];
  const itemSizeLabel=item=>item.id==='discovery'?'3 × 10 ml':item.size+' ml';
  const bagTotal=()=>bag.reduce((sum,item)=>sum+itemPrice(item)*item.qty,0);
  let delivery=null,pinRequest=0,pinController=null;
  let promo=null,promoRequest=0;
  const pinCache=new Map();
  function totalsHTML(){
    const discount=promo?.discount||0;
    const subtotal=bagTotal();
    const shipping=delivery?.charge||0;
    return '<div class="shipping-totals"><div><span>Perfumes</span><span>'+formatPrice(subtotal)+'</span></div>'+
      '<div><span>Shipping</span><span>'+(delivery?formatPrice(shipping):'Check PIN code')+'</span></div>'+
      (discount?'<div class="promo-saving"><span>Promo '+promo.code+'</span><span>−'+formatPrice(discount)+'</span></div>':'')+
      '<div class="bag-total"><span>'+(delivery?'Order total':'Subtotal')+'</span><strong>'+formatPrice(subtotal+shipping-discount)+'</strong></div></div>';
  }
  function bagTotalsHTML(){
    // Bag: merchandise only. Delivery is calculated on the final checkout page.
    const subtotal=bagTotal();
    return '<div class="shipping-totals"><div><span>Perfumes</span><span>'+formatPrice(subtotal)+'</span></div>'+
      '<div class="bag-total"><span>Subtotal</span><strong>'+formatPrice(subtotal)+'</strong></div></div>';
  }
  function renderCheckoutTotals(){$('#checkout-totals').innerHTML=totalsHTML();}
  function refreshDeliveryTotals(){renderCheckoutTotals();if(bagDialog.open&&!$('#bag-step').hidden)renderBag();}
  function pinStatus(text){$$('[data-pin-status]').forEach(el=>el.textContent=text);}
  $$('[data-pin-input]').forEach(input=>{
    input.addEventListener('input',()=>{const value=input.value.replace(/\D/g,'').slice(0,6);$$('[data-pin-input]').forEach(el=>el.value=value);delivery=null;pinRequest++;pinController?.abort();$$('[data-check-pin]').forEach(el=>el.disabled=false);pinStatus('Check this PIN code for delivery availability.');refreshDeliveryTotals();});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.closest('.delivery-check').querySelector('[data-check-pin]').click();}});
  });
  $$('[data-check-pin]').forEach(button=>button.addEventListener('click',async()=>{
    const input=button.closest('.delivery-check').querySelector('[data-pin-input]'),pin=input.value;
    if(!/^[1-9]\d{5}$/.test(pin)){pinStatus('Please enter a valid 6-digit Indian PIN code.');input.focus();return;}
    const request=++pinRequest;pinController?.abort();pinController=new AbortController();const controller=pinController;
    delivery=null;refreshDeliveryTotals();$$('[data-check-pin]').forEach(el=>el.disabled=true);pinStatus('Checking your delivery area…');
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      let records=pinCache.get(pin);
      if(!records){const response=await fetch('https://api.postalpincode.in/pincode/'+pin,{signal:controller.signal,referrerPolicy:'no-referrer'});if(!response.ok)throw new Error();records=await response.json();}
      if(request!==pinRequest)return;
      const offices=records?.[0]?.Status==='Success'?records[0].PostOffice:[];
      const usable=(offices||[]).filter(o=>String(o.Pincode)===pin&&o.Country==='India'&&o.State);
      const states=[...new Set(usable.map(o=>o.State.trim()))];
      if(states.length!==1){pinStatus('We could not verify this PIN. Check the number and try again.');return;}
      pinCache.set(pin,records);
      const state=states[0],normalizedState=state.replace(/[^a-z]/gi,'').toLowerCase();
      const tamilNadu=normalizedState==='tamilnadu';
      const districts=[...new Set(usable.map(o=>String(o.District||'').replace(/[^a-z]/gi,'').toLowerCase()).filter(Boolean))];
      if(tamilNadu&&!districts.length){
        pinStatus('We could not verify the delivery district. Please try again.');return;
      }
      const nearby=new Set(['chengalpattu','kanchipuram','kancheepuram','tiruvallur','thiruvallur']);
      const charge=!tamilNadu?149:districts.includes('chennai')?59:
        districts.some(d=>nearby.has(d))?79:99;
      delivery={pin,state,district:districts[0]||'',charge};
      pinStatus('Delivery available to this PIN code.');refreshDeliveryTotals();
    }catch{if(request===pinRequest)pinStatus('Unable to check availability right now. Please try again.');}
    finally{clearTimeout(timeout);if(request===pinRequest)$$('[data-check-pin]').forEach(el=>el.disabled=false);}
  }));
  // Promo codes are checked against the private sheet by a server-side Vercel function.
  const promoInput=$('#promo-code'),promoButton=$('#promo-apply'),promoStatus=$('#promo-status');
  if(promoInput&&promoButton&&promoStatus){
    promoInput.addEventListener('input',()=>{
      promoInput.value=promoInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32);
      promo=null;promoRequest++;promoButton.disabled=false;promoStatus.textContent='';
      renderCheckoutTotals();
    });
    promoInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();promoButton.click();}});
    promoButton.addEventListener('click',async()=>{
      const code=promoInput.value.trim().toUpperCase();
      if(!/^[A-Z0-9_-]{3,32}$/.test(code)){promoStatus.textContent='Promo code is not valid.';return;}
      if(!bag.length){promoStatus.textContent='Choose a fragrance before applying a code.';return;}
      const request=++promoRequest;promoButton.disabled=true;promoStatus.textContent='Checking your code…';
      try{
        const result=await fetch('/api/promo?code='+encodeURIComponent(code)+'&subtotal='+bagTotal(),{cache:'no-store'});
        const data=await result.json();
        if(request!==promoRequest)return;
        if(!result.ok||data.success!==true){promoStatus.textContent='Promo verification is temporarily unavailable. Please try again.';return;}
        if(!data.valid){promoStatus.textContent=data.message||'Promo code is not valid.';return;}
        if(data.code!==code||!Number.isFinite(data.discount)||data.discount<=0||data.discount>bagTotal())throw Error('Invalid response');
        promo={code,discount:data.discount};
        promoStatus.textContent='Code applied. You save '+formatPrice(data.discount)+'.';
        renderCheckoutTotals();
      }catch{if(request===promoRequest)promoStatus.textContent='Unable to check your code right now. Please try again.';}
      finally{if(request===promoRequest)promoButton.disabled=false;}
    });
  }
  function updateCount(){
    $$('[data-bag-count]').forEach(el=>{el.textContent=itemCount();el.hidden=!itemCount()});
    $$('[data-open-bag]').forEach(el=>el.setAttribute('aria-label','Reserve your bottle, '+itemCount()+' items in your bag'));
  }
  function saveBag(){try{localStorage.setItem('ra-presence-selection',JSON.stringify(bag))}catch{}updateCount()}
  function showToast(message){const el=$('.toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2500)}
  function openDialog(dialog,origin=document.activeElement){focusOrigins.set(dialog,origin);dialog.showModal();dialog.scrollTop=0}
  $$('dialog').forEach(dialog=>{
    dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]')){const origin=focusOrigins.get(dialog);if(origin?.isConnected)origin.focus({preventScroll:true})}});
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()});
  });
  $$('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  function setSize(size){currentSize=Number(size);$$('.size-option').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.size)===currentSize)));$('#product-price').textContent=formatPrice(prices[currentSize]);$('#product-original').textContent=formatPrice(originalPrices[currentSize]);$('#product-size-caption').textContent=currentSize+' ml'}
  function showProduct(id){
    const product=products[id];if(!product)return;
    currentProduct=id;
    $('#product-title').textContent=product.name;
    $('.product-story').textContent=product.story;
    const image=$('#product-image');
    image.src=product.image;
    image.alt=id==='discovery'?'RA Perfumes Discovery Set containing ILAVEYIL, IRAVÉ and French Rose Oud, three 10 ml bottles':product.name+' by RA Perfumes';
    image.hidden=false;
    const isSet=id==='discovery';
    $('.product-art',productDialog).classList.toggle('is-discovery',isSet);
    $('.sizes',productDialog).hidden=isSet;
    if(shop){const navigation=$('.scent-switch');if(navigation)navigation.hidden=isSet;}
    $('#product-original').hidden=false;
    if(isSet){
      currentSize=30;
      $('#product-original').textContent=formatPrice(399);
      $('#product-price').textContent=formatPrice(199);
      $('#product-size-caption').textContent='3 × 10 ml';
    }else setSize(50);
    if(!shop)openDialog(productDialog);
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-product]');if(button)location.href='the-scent.html?scent='+button.dataset.product});
  $$('.size-option').forEach(button=>button.addEventListener('click',()=>setSize(button.dataset.size)));
  function addBottle(id, size, origin) {
    const item = bag.find(entry => entry.id === id && entry.size === size);
    if (item && item.qty >= 99) {
      showToast('You already have 99 of this bottle in your bag.');
      return;
    }
    if (item) item.qty++;
    else bag.push({id, size, qty: 1});
    saveBag();
    openBag(origin);
  }
  $('#add-selection').addEventListener('click', event => {
    addBottle(currentProduct, currentSize, event.currentTarget);
  });
  $$('[data-quick-add]').forEach(button => {
    button.addEventListener('click', () => addBottle(button.dataset.quickAdd, button.dataset.quickAdd==='discovery'?30:50, button));
  });
  function setStep(step,focus=true){
    ['bag','details'].forEach(name=>{const panel=bagDialog.querySelector('#'+name+'-step');if(panel)panel.hidden=name!==step;});
    const heading=step==='bag'?'bag-title':'details-title';
    bagDialog.setAttribute('aria-labelledby',heading);bagDialog.scrollTop=0;
    if(focus)$('#'+heading).focus({preventScroll:true});
  }
  function renderBag(){
    const items=$('#bag-items'),summary=$('#bag-summary');items.replaceChildren();summary.replaceChildren();
    if(!bag.length){
      const text=document.createElement('p');text.className='empty-bag';text.textContent='Some encounters begin with curiosity. Find the scent you want to know closer.';items.append(text);
      const button=document.createElement('button');button.className='primary-button';button.innerHTML='Explore the collection '+bottleControl;button.addEventListener('click',()=>{bagDialog.close();if(shop){location.href='the-scent.html';return}$('#collection').scrollIntoView({behavior:reduce.matches?'auto':'smooth'})});summary.append(button);return;
    }
    bag.forEach((item,index)=>{
      const product=products[item.id],row=document.createElement('div');row.className='bag-item';
      // Only closed, validated catalogue values are interpolated. Customer text uses textContent.
      row.innerHTML='<img src="'+product.image+'" alt="'+product.name+' perfume" width="112" height="142"><div><h3>'+product.name+'</h3><small>'+itemSizeLabel(item)+' · Eau de parfum</small><div class="quantity-controls"><button aria-label="Reduce '+product.name+' '+itemSizeLabel(item)+' quantity" data-adjust="-1">−</button><span aria-label="Quantity">'+item.qty+'</span><button aria-label="Increase '+product.name+' '+itemSizeLabel(item)+' quantity" data-adjust="1"'+(item.qty===99?' disabled':'')+'>+</button></div></div><div class="item-end"><span class="item-price">'+formatPrice(itemPrice(item)*item.qty)+'</span><button class="remove-item" aria-label="Remove '+product.name+' '+itemSizeLabel(item)+'">Remove</button></div>';
      $$('[data-adjust]',row).forEach(button=>button.addEventListener('click',()=>{const label=button.getAttribute('aria-label');item.qty=Math.max(0,Math.min(99,item.qty+Number(button.dataset.adjust)));if(!item.qty)bag.splice(index,1);saveBag();renderBag();const next=$$('button',items).find(el=>el.getAttribute('aria-label')===label);if(next&&!next.disabled)next.focus({preventScroll:true})}));
      $('.remove-item',row).addEventListener('click',()=>{bag.splice(index,1);saveBag();renderBag();$('#bag-title').focus({preventScroll:true})});items.append(row);
    });
    summary.innerHTML=bagTotalsHTML()+'<button class="primary-button" id="continue-details">Continue '+bottleControl+'</button><p class="order-note">A little closer to your signature.</p>';
    $('#continue-details').addEventListener('click',()=>{
      const pin = delivery ? '?pin=' + delivery.pin : '';
      location.href = (phoneAuth.enabled ? 'login.html' : 'checkout.html') + pin;
    });
  }
  function openBag(origin=document.activeElement){renderBag();setStep('bag',false);openDialog(bagDialog,origin)}
  $$('[data-open-bag]').forEach(button=>button.addEventListener('click',()=>openBag(button)));
  $('#back-to-bag').addEventListener('click',()=>openBag());

  const nameInput=$('#customer-name'),mobileInput=$('#customer-mobile'),emailInput=$('#customer-email');
  let verifiedPhone = '';
  if ($('#order-details')) {
    if (!bag.length) location.replace('the-scent.html');
    $('#details-summary').textContent = bag.map(item => products[item.id].name + ' · ' + itemSizeLabel(item) + ' × ' + item.qty).join(' / ');
    renderCheckoutTotals();
    const pin = new URLSearchParams(location.search).get('pin');
    if (/^[1-9]\d{5}$/.test(pin)) {
      $('#customer-pin').value = pin;
      $('#customer-pin').closest('.delivery-check').querySelector('button').click();
    }
    if (phoneAuth.enabled) {
      $('#customer-form').hidden = true;
      phoneAuth.request('user', null, sessionStorage.getItem('ra-auth')).then(user => {
        if (!user.phone_confirmed_at) throw new Error();
        verifiedPhone = String(user.phone||'').replace(/\D/g,'').replace(/^91(?=[6-9]\d{9}$)/,'');
        mobileInput.value = verifiedPhone;
        mobileInput.readOnly = true;
        $('#customer-form').hidden = false;
      }).catch(() => location.replace('login.html' + location.search));
    }
  }
  function validateName(){nameInput.setCustomValidity(nameInput.value.trim().length>=2?'':'Please enter your full name.');return nameInput.validity.valid}
  function validateMobile(){const valid=/^[6-9]\d{9}$/.test(mobileInput.value);mobileInput.setCustomValidity(valid?'':'Enter exactly 10 digits, beginning with 6, 7, 8 or 9.');return valid}
  nameInput.addEventListener('input',()=>nameInput.setCustomValidity(''));
  mobileInput.addEventListener('input',()=>{const digits=mobileInput.value.replace(/\D/g,'').slice(0,10);if(mobileInput.value!==digits)mobileInput.value=digits;mobileInput.setCustomValidity('')});
  $('#customer-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(phoneAuth.enabled && !verifiedPhone)return;
    if(!bag.length){$('#order-feedback').textContent='Your bag is empty.';return;}
    validateName();validateMobile();if(!event.currentTarget.reportValidity())return;
    if(!delivery){$('#order-feedback').textContent='Please check your delivery PIN code before continuing.';$('#customer-pin').focus();return;}
    if(!/^\d{10,15}$/.test(WHATSAPP_NUMBER)){$('#order-feedback').textContent='Online ordering is temporarily unavailable.';return;}
    const customer={name:nameInput.value.trim(),mobile:mobileInput.value.trim(),email:emailInput.value.trim()};
    const button=event.currentTarget.querySelector('button[type="submit"]'),feedback=$('#order-feedback');
    const orderKey=JSON.stringify({items:bag,pin:delivery.pin,customer,promo:promo?.code||''});
    let orderId,previousKey;
    try{orderId=sessionStorage.getItem('ra-pending-order-id');previousKey=sessionStorage.getItem('ra-pending-order-key')}catch{}
    if(!orderId || previousKey!==orderKey){
      orderId='RA-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
      try{sessionStorage.setItem('ra-pending-order-id',orderId);sessionStorage.setItem('ra-pending-order-key',orderKey)}catch{}
    }
    button.disabled=true;feedback.textContent='Saving your order securely…';
    try{
      const result=await fetch('/api/order',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId,...customer,pincode:delivery.pin,promoCode:promo?.code||'',items:bag.map(({id,size,qty})=>({id,size,qty}))})
      });
      const saved=await result.json();
      const serialAssigned=/^20\d{8}$/.test(String(saved.orderId||'')) && saved.requestId===orderId;
      if(!result.ok||saved.success!==true||!(saved.orderId===orderId||serialAssigned))throw Error(saved.error||'Order not saved');
      const confirmedOrderId=serialAssigned?saved.orderId:orderId;
      orderMessage='Hello RA Perfumes, I would like to order:\n\n'+
        bag.map(item=>products[item.id].name+' · '+itemSizeLabel(item)+' × '+item.qty+'\n'+formatPrice(itemPrice(item)*item.qty)).join('\n\n')+
        '\n\nOrder ID: '+confirmedOrderId+'\nSubtotal: '+formatPrice(bagTotal())+
        '\nShipping: '+formatPrice(saved.shipping)+
        (saved.promoCode?'\nPromo '+saved.promoCode+': −'+formatPrice(saved.discount):'')+'\nOrder total: '+formatPrice(saved.total)+
        '\n\nName: '+customer.name+'\nMobile: '+customer.mobile+'\nEmail: '+customer.email+
        '\nDelivery PIN: '+delivery.pin+'\n\nPlease confirm availability. Thank you.';
      window.location.assign('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(orderMessage));
    }catch(error){
      feedback.textContent=error?.message && /promo/i.test(error.message)?'Promo code is no longer valid. Please reapply it.':'We could not save your order. Please try Continue again. No WhatsApp order has been opened.';
      button.disabled=false;
    }
  });

  function setMood(id){const product=products[id];$('.scent-secret').open=false;$$('.mood-tab').forEach(tab=>{const active=tab.dataset.mood===id;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1});const image=$('#mood-image');image.src=product.moodImage;image.alt=product.moodAlt;$('#mood-caption').textContent=product.name+' / '+product.inspiration;$('.mood-description').textContent=product.description;$('.mood-quote').replaceChildren(...product.quote.split('\n').flatMap((line,index)=>index?[document.createElement('br'),document.createTextNode(line)]:[document.createTextNode(line)]));$('.mood-link').dataset.product=id;$('.mood-link>span').textContent='Meet '+product.name;$('#mood-panel').setAttribute('aria-labelledby','mood-'+id)}
  $$('.mood-tab').forEach((tab,index)=>{tab.addEventListener('click',()=>setMood(tab.dataset.mood));tab.addEventListener('keydown',event=>{const tabs=$$('.mood-tab');let next;if(event.key==='ArrowRight')next=(index+1)%3;else if(event.key==='ArrowLeft')next=(index+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();setMood(tabs[next].dataset.mood);tabs[next].focus()})});

  const shop = document.querySelector('.scent-shop');
  if (shop && ['fresh','arena','oud','discovery'].includes(new URLSearchParams(location.search).get('scent'))) {
    $('.catalog').hidden = true;
    shop.hidden = false;
    $('.skip').href = '#fragrance-detail';
    showProduct(new URLSearchParams(location.search).get('scent'));
  }
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in');observer.unobserve(entry.target)}}),{threshold:.08});
  if(!reduce.matches)document.body.classList.add('js-motion');$$('.reveal').forEach(el=>observer.observe(el));
  reduce.addEventListener('change',event=>{document.body.classList.toggle('js-motion',!event.matches);if(event.matches)$$('.reveal').forEach(el=>el.classList.add('in'))});
  document.addEventListener('click',event=>{
    const control=event.target.closest('button,a');
    if(!control||control.disabled||reduce.matches)return;
    const bottle=control.querySelector('.perfume-disc');
    if(!bottle)return;
    const rect=bottle.getBoundingClientRect();
    const mist=document.createElement('div');
    mist.className='fragrance-mist';mist.setAttribute('aria-hidden','true');mist.setAttribute('popover','manual');
    mist.style.left=(rect.left+rect.width/2)+'px';mist.style.top=(rect.top+9)+'px';
    for(let i=0;i<9;i++){
      const particle=document.createElement('i');
      particle.style.setProperty('--dx',((i-4)*8)+'px');
      particle.style.setProperty('--dy',(-30-Math.sin(i/8*Math.PI)*25)+'px');
      particle.style.setProperty('--delay',(i%3*25)+'ms');mist.append(particle);
    }
    document.body.append(mist);try{if(mist.showPopover)mist.showPopover();}catch{}
    if(typeof bottle.animate==='function')bottle.animate([{transform:'translateY(0)'},{transform:'translateY(2px)'},{transform:'translateY(0)'}],{duration:240});
    setTimeout(()=>mist.remove(),750);
  },true);
  // Blend the navigation into the page as the film leaves the viewport.
  const header=$('.site-header'),hero=$('.hero');
  let headerFrame=0,lastBlend=-1;
  function updateHeader(){
    headerFrame=0;
    const height=header.offsetHeight;
    const blend=Math.max(0,Math.min(1,(height-hero.getBoundingClientRect().bottom)/Math.max(1,height)));
    if(Math.abs(blend-lastBlend)>.005){header.style.setProperty('--header-fill',blend.toFixed(3));lastBlend=blend;}
  }
  function queueHeader(){if(!headerFrame)headerFrame=requestAnimationFrame(updateHeader);}
  if(hero){addEventListener('scroll',queueHeader,{passive:true});addEventListener('resize',queueHeader,{passive:true});
  new ResizeObserver(queueHeader).observe(hero);updateHeader();}
  if($('#year'))$('#year').textContent=new Date().getFullYear();updateCount();
})();
