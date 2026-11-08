// RA Perfumes order receiver — server-side bridge to Google Apps Script.
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzS2llzW9tvzHaODte9uC1w0H494bDfQ7w2CXfnXjPLEDlPA_SJCXooLb2z9cNf2hSlJw/exec';
const PRICES = {30:399,50:599,100:1299};
const NAMES = {fresh:'ILAVEYIL',arena:'IRAVÉ',oud:'French Rose Oud',discovery:'Discovery Set (ILAVEYIL, IRAVÉ, French Rose Oud)'};
const validText = (v,max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'});}
  res.setHeader('Cache-Control','no-store');
  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!d || !validText(d.name,80) || !validText(d.email,150) || !validText(d.mobile,10) ||
        !validText(d.orderId,80) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) ||
        !/^[6-9]\d{9}$/.test(d.mobile) || !/^[1-9]\d{5}$/.test(String(d.pincode||'')) ||
        !Array.isArray(d.items) || !d.items.length || d.items.length > 9) {
      return res.status(400).json({success:false,error:'Invalid order information'});
    }
    let subtotal=0;
    const lines=[];
    for(const item of d.items){
      const size=Number(item.size), qty=Number(item.qty);
      if(!Object.hasOwn(NAMES,item.id) || !Object.hasOwn(PRICES,size) || (item.id==='discovery'&&size!==30) || !Number.isInteger(qty) || qty<1 || qty>99){
        return res.status(400).json({success:false,error:'Invalid fragrance selection'});
      }
      subtotal += (item.id==='discovery'?199:PRICES[size])*qty;
      lines.push(NAMES[item.id]+' '+(item.id==='discovery'?'3 x 10ml':size+'ml')+' x '+qty);
    }
    if(subtotal>1000000)return res.status(400).json({success:false,error:'Order amount too high'});
    // Confirm state on the server: don't trust a browser-provided shipping fee.
    const postal=await fetch('https://api.postalpincode.in/pincode/'+d.pincode,{signal:AbortSignal.timeout(9000)});
    if(!postal.ok)throw Error('PIN verification service unavailable');
    const results=await postal.json();
    const states=[...new Set((results?.[0]?.PostOffice||[])
      .filter(o=>String(o.Pincode)===String(d.pincode)&&o.Country==='India'&&o.State)
      .map(o=>o.State.trim()))];
    if(states.length!==1)return res.status(400).json({success:false,error:'Unable to verify PIN code'});
    const shipping=states[0].replace(/\s/g,'').toLowerCase()==='tamilnadu'?49:149;
    let promoCode='',discount=0;
    if(d.promoCode){
      promoCode=String(d.promoCode).trim().toUpperCase();
      if(!/^[A-Z0-9_-]{3,32}$/.test(promoCode))return res.status(400).json({success:false,error:'Promo code is not valid'});
      const validateUrl=new URL(SHEETS_URL);
      validateUrl.searchParams.set('action','validatePromo');
      validateUrl.searchParams.set('code',promoCode);
      validateUrl.searchParams.set('subtotal',String(subtotal));
      const verification=await fetch(validateUrl,{redirect:'follow',signal:AbortSignal.timeout(13000)});
      if(!verification.ok)throw Error('Promo service unavailable');
      const verified=await verification.json();
      if(verified.success!==true||typeof verified.valid!=='boolean')throw Error('Promo receiver not updated');
      if(!verified.valid)return res.status(400).json({success:false,error:verified.message||'Promo code is not valid'});
      discount=Number(verified.discount);
      if(verified.code!==promoCode||!Number.isFinite(discount)||discount<=0||discount>subtotal)throw Error('Invalid promo discount');
    }
    const payload={
      name:d.name.trim(),email:d.email.trim(),mobile:d.mobile.trim(),
      orderId:d.orderId.trim(),pincode:String(d.pincode),items:lines.join('; '),
      subtotal,shipping,promoCode,discount,total:subtotal+shipping-discount
    };
    const response=await fetch(SHEETS_URL,{
      method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(14000)
    });
    const raw=await response.text();
    let outcome;
    try{outcome=JSON.parse(raw)}catch{throw Error('Spreadsheet service returned an unexpected response')}
    // New Apps Script receivers assign the reference atomically after the row is saved.
    // Older receivers can still return the internal request key during migration.
    const assigned=typeof outcome.orderId==='string' && /^20\d{8}$/.test(outcome.orderId) &&
      outcome.requestId===payload.orderId;
    const legacy=outcome.orderId===payload.orderId;
    if(!response.ok || outcome.success!==true || (!assigned&&!legacy)){
      throw Error(outcome.error||'Unable to save order');
    }
    return res.status(200).json({success:true,orderId:assigned?outcome.orderId:payload.orderId,
      requestId:payload.orderId,total:payload.total,shipping,discount,promoCode});
  }catch(error){
    console.error('RA order submission failed:',error.message);
    return res.status(502).json({success:false,error:'Could not save your order. Please try again.'});
  }
}
