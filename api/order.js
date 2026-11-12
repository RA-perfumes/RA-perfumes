// RA Perfumes order receiver — server-side bridge to Google Apps Script.
import {createRequire} from 'node:module';
const postalStates=createRequire(import.meta.url)('../assets/postal-states.json');
import {createHash} from 'node:crypto';
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzS2llzW9tvzHaODte9uC1w0H494bDfQ7w2CXfnXjPLEDlPA_SJCXooLb2z9cNf2hSlJw/exec';
const PRICES = {30:499,50:799,100:1499};
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
      subtotal += (item.id==='discovery'?299:PRICES[size])*qty;
      lines.push(NAMES[item.id]+' '+(item.id==='discovery'?'3 x 10ml':size+'ml')+' x '+qty);
    }
    if(subtotal>1000000)return res.status(400).json({success:false,error:'Order amount too high'});
    // Confirm state on the server: don't trust a browser-provided shipping fee.
    let state=postalStates[String(d.pincode)];
    if(!state){
      const postal=await fetch('https://api.postalpincode.in/pincode/'+d.pincode,{signal:AbortSignal.timeout(9000)});
      if(!postal.ok)throw Error('PIN verification service unavailable');
      const results=await postal.json();
      const offices=(results?.[0]?.PostOffice||[])
        .filter(o=>String(o.Pincode)===String(d.pincode)&&o.Country==='India'&&o.State);
      const states=[...new Set(offices.map(o=>o.State.trim()))];
      if(states.length!==1)return res.status(400).json({success:false,error:'Unable to verify PIN code'});
      state=states[0];
    }
    const tamilNadu=state.replace(/[^a-z]/gi,'').toLowerCase()==='tamilnadu';
    let promoCode='',discount=0;
    if(d.promoCode){
      promoCode=String(d.promoCode).trim().toUpperCase();
      if(!/^[A-Z0-9_-]{3,32}$/.test(promoCode))return res.status(400).json({success:false,error:'Promo code is not valid'});
      if(createHash('sha256').update(promoCode).digest('hex')==='e9addaa26ad6fc1d39549038b62beb902acc8e690fb4e8bc021c533dca1e4326'){
        discount=d.items.reduce((sum,item)=>sum+(item.id!=='discovery'&&Number(item.size)===50?299*Number(item.qty):0),0);
        if(!discount)return res.status(400).json({success:false,error:'Coupon valid on select products only'});
      }else{
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
    }
    // Match the exact uploaded storefront: free shipping from ₹599 net; smaller orders ₹59 in Tamil Nadu, ₹99 elsewhere.
    const shipping = subtotal-discount>=599 ? 0 : (tamilNadu?59:99);
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
