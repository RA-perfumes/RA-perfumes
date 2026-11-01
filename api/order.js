// RA Perfumes order receiver — server-side bridge to Google Apps Script.
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzh9DRWIvVrpzC3GU_omcldf4dlzzBj7AWhUCnvysr1rH_f1QTI_fkFtA_6PpBLKH4Vaw/exec';
const PRICES = {30:399,50:599,100:1299};
const NAMES = {fresh:'Fresh',arena:'Arena',oud:'Oud'};
const validText = (v,max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'});}
  res.setHeader('Cache-Control','no-store');
  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!d || !validText(d.name,80) || !validText(d.email,150) || !validText(d.mobile,25) ||
        !validText(d.orderId,80) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) ||
        !/^\+?[\d ()-]{10,25}$/.test(d.mobile) || !/^[1-9]\d{5}$/.test(String(d.pincode||'')) ||
        !Array.isArray(d.items) || !d.items.length || d.items.length > 9) {
      return res.status(400).json({success:false,error:'Invalid order information'});
    }
    let subtotal=0;
    const lines=[];
    for(const item of d.items){
      const size=Number(item.size), qty=Number(item.qty);
      if(!Object.hasOwn(NAMES,item.id) || !Object.hasOwn(PRICES,size) || !Number.isInteger(qty) || qty<1 || qty>99){
        return res.status(400).json({success:false,error:'Invalid fragrance selection'});
      }
      subtotal += PRICES[size]*qty;
      lines.push(NAMES[item.id]+' '+size+'ml x '+qty);
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
    const shipping=states[0].replace(/\s/g,'').toLowerCase()==='tamilnadu'?99:199;
    const payload={
      name:d.name.trim(),email:d.email.trim(),mobile:d.mobile.trim(),
      orderId:d.orderId.trim(),pincode:String(d.pincode),items:lines.join('; '),
      subtotal,shipping,total:subtotal+shipping
    };
    const response=await fetch(SHEETS_URL,{
      method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(14000)
    });
    const raw=await response.text();
    let outcome;
    try{outcome=JSON.parse(raw)}catch{throw Error('Spreadsheet service returned an unexpected response')}
    if(!response.ok || outcome.success!==true || outcome.orderId!==payload.orderId){
      throw Error(outcome.error||'Unable to save order');
    }
    return res.status(200).json({success:true,orderId:payload.orderId,total:payload.total,shipping});
  }catch(error){
    console.error('RA order submission failed:',error.message);
    return res.status(502).json({success:false,error:'Could not save your order. Please try again.'});
  }
}
