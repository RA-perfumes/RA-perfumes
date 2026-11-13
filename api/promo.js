// Validate codes using the private RA Coupons Google Sheet. Every code applies only to 50 ml bottles.
const SHEETS_URL=process.env.RA_SHEETS_URL;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({success:false,error:'Method not allowed'});}
  const code=String(req.query.code||'').trim().toUpperCase();
  const qty=Number(req.query.qty||1);
  if(!/^[A-Z0-9_-]{3,32}$/.test(code)||!Number.isInteger(qty)||qty<1||qty>891){
    return res.status(400).json({success:true,valid:false,message:'Promo code is not valid.'});
  }
  if(!SHEETS_URL)return res.status(503).json({success:false,error:'Promo service is not configured'});
  try{
    const url=new URL(SHEETS_URL);
    url.searchParams.set('action','validatePromo');
    url.searchParams.set('code',code);
    // Google Apps Script returns the discount for one eligible bottle.
    url.searchParams.set('subtotal','799');
    const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(13000),headers:{'Accept':'application/json'}});
    if(!response.ok)throw Error('Promo service unavailable');
    const result=await response.json();
    if(result.success!==true||typeof result.valid!=='boolean')throw Error('Invalid promo receiver response');
    if(!result.valid)return res.status(200).json({success:true,valid:false,message:result.message||'Promo code is not valid.'});
    const rate=Number(result.discount);
    if(result.code!==code||!Number.isInteger(rate)||rate<=0||rate>799)throw Error('Invalid discount rate');
    return res.status(200).json({success:true,valid:true,code,discount:rate*qty});
  }catch(error){console.error('Promo verification unavailable:',error.message);return res.status(503).json({success:false,error:'Promo validation temporarily unavailable'});}
}
