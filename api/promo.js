const {verifyCoupon}=require('../lib/coupons');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({success:false,status:'invalid'});}
  const code=String(req.query.code||'').trim().toUpperCase();
  let items;
  try{
    items=JSON.parse(String(req.query.cart||'[]'));
    const result=await verifyCoupon(code,items);
    return res.status(200).json(result);
  }catch(error){
    console.error('Coupon verification:',error.message);
    if(error.message==='Invalid cart'||error.message==='Invalid subtotal')return res.status(200).json({success:true,valid:false,status:'invalid'});
    return res.status(503).json({success:false,valid:false,status:'invalid'});
  }
};
