// Shared coupon validation for RA Perfumes checkout and order confirmation.
const SHEETS_URL=process.env.RA_SHEETS_URL;
const PRICES={30:499,50:799,100:1499,discovery:299};
function cartTotals(items){
  if(!Array.isArray(items)||!items.length||items.length>9)throw Error('Invalid cart');
  let subtotal=0;const qty={30:0,50:0,100:0,discovery:0};
  for(const item of items){
    const size=item.id==='discovery'?'discovery':Number(item.size),count=Number(item.qty);
    if(!Object.hasOwn(PRICES,size)||!Number.isInteger(count)||count<1||count>99||!['fresh','arena','oud','discovery'].includes(item.id)||(item.id==='discovery'&&Number(item.size)!==30))throw Error('Invalid cart');
    qty[size]+=count;subtotal+=PRICES[size]*count;
  }
  if(subtotal<=0||subtotal>1000000)throw Error('Invalid subtotal');
  return {subtotal,qty};
}
async function verifyCoupon(code,items){
  code=String(code||'').trim().toUpperCase();
  if(!/^[A-Z0-9_-]{3,32}$/.test(code))return {success:true,valid:false,status:'invalid'};
  const {subtotal,qty}=cartTotals(items);
  if(!SHEETS_URL)throw Error('Coupon service is not configured');
  const url=new URL(SHEETS_URL);
  url.searchParams.set('action','validatePromo');
  url.searchParams.set('code',code);
  url.searchParams.set('subtotal','799'); // Compatibility with the original Apps Script receiver.
  const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(13000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Coupon receiver unavailable');
  const data=await response.json();
  if(data.success!==true||typeof data.valid!=='boolean')throw Error('Coupon receiver returned unexpected data');
  if(!data.valid)return {success:true,valid:false,status:data.status==='expired'?'expired':'invalid'};
  if(data.code!==code)throw Error('Coupon code mismatch');
  const rate=Number(data.rate??data.discount);
  if(!Number.isSafeInteger(rate)||rate<=0||rate>1000000)throw Error('Invalid coupon rate');
  const scope=String(data.appliesTo||(code==='RA-A7K9-M4P2'?'50 ml only':'All products')).trim().toLowerCase();
  const sizes={'30 ml only':30,'50 ml only':50,'100 ml only':100,'discovery set':'discovery'};
  let discount;
  if(scope==='all products')discount=rate;
  else if(Object.hasOwn(sizes,scope)){
    const count=qty[sizes[scope]];
    if(!count)return {success:true,valid:false,status:'invalid'};
    discount=rate*count;
  }else throw Error('Unknown coupon scope');
  // Never silently turn an over-value coupon into a free or negative-price order.
  if(!Number.isSafeInteger(discount)||discount>subtotal)return {success:true,valid:false,status:'invalid'};
  return {success:true,valid:true,status:'valid',code,discount};
}
module.exports={verifyCoupon,cartTotals};
