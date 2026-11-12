// Validate promo codes on the server against the private RA Perfumes Google Sheet.
const SHEETS_URL=process.env.RA_SHEETS_URL || 'https://script.google.com/macros/s/AKfycbzS2llzW9tvzHaODte9uC1w0H494bDfQ7w2CXfnXjPLEDlPA_SJCXooLb2z9cNf2hSlJw/exec';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({success:false,error:'Method not allowed'});}
  const code=String(req.query.code||'').trim().toUpperCase();
  const subtotal=Number(req.query.subtotal);
  if(!/^[A-Z0-9_-]{3,32}$/.test(code) || !Number.isFinite(subtotal) || subtotal<=0 || subtotal>1000000) {
    return res.status(400).json({success:true,valid:false,message:'Promo code is not valid'});
  }
  try {
    const url=new URL(SHEETS_URL);
    url.searchParams.set('action','validatePromo');
    url.searchParams.set('code',code);
    url.searchParams.set('subtotal',String(subtotal));
    const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(13000),headers:{'Accept':'application/json'}});
    if(!response.ok)throw Error('Promo service unavailable');
    const result=await response.json();
    if(result.success!==true || typeof result.valid!=='boolean')throw Error('Promo receiver not updated');
    if(!result.valid)return res.status(200).json({success:true,valid:false,message:result.message||'Promo code is not valid'});
    if(result.code!==code || typeof result.discount!=='number' || !Number.isFinite(result.discount) || result.discount<=0 || result.discount>subtotal) throw Error('Invalid discount response');
    return res.status(200).json({success:true,valid:true,code,discount:result.discount});
  }catch(error){console.error('Promo verification unavailable:',error.message);return res.status(503).json({success:false,error:'Promo validation temporarily unavailable'});}
}
