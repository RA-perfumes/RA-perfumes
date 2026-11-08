const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
(async()=>{
  const script=fs.readFileSync('apps-script/Code.gs','utf8');
  const rows=[['Timestamp','Order ID','Name','Email','Mobile','PIN Code','Items','Subtotal (INR)','Shipping (INR)','Total (INR)','Status','Promo Code','Discount (INR)']];
  const sheet={
    getLastRow:()=>rows.length,
    getMaxColumns:()=>14,
    getRange:(r,c,nr=1,nc=1)=>({
      getValues:()=>rows.slice(r-1,r-1+nr).map(row=>Array.from({length:nc},(_,j)=>row[c-1+j]??'')),
      getValue:()=>rows[r-1]?.[c-1]??'',
      setValue:value=>{rows[r-1]??=[];rows[r-1][c-1]=value;return {setFontWeight:()=>{}}},
      setValues:values=>{values.forEach((arr,i)=>{rows[r-1+i]=arr});return {setFontWeight:()=>{}}},
      setNumberFormat:()=>{}
    }),
    appendRow:row=>{rows.push(row)},
    setFrozenRows:()=>{},
    insertColumnsAfter:()=>{}
  };
  const book={getSheetByName:name=>name==='Responses'?sheet:null,insertSheet:()=>sheet};
  let locked=0;
  const ctx={
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})},
    SpreadsheetApp:{openById:()=>book,flush:()=>{}},
    LockService:{getScriptLock:()=>({waitLock:()=>{locked++},releaseLock:()=>{locked--}})},
    Session:{getScriptTimeZone:()=> 'Asia/Kolkata'},
    Utilities:{formatDate:()=> '2026'},
    console,Date
  };
  vm.createContext(ctx);vm.runInContext(script,ctx);
  const request=(token,mobile='9876543210')=>({postData:{contents:JSON.stringify({
    orderId:token,name:'Test Customer',email:'test@example.com',mobile,pincode:'600039',
    items:'ILAVEYIL 50ml x 1',subtotal:599,shipping:59,discount:0,total:658
  })}});
  const post=x=>JSON.parse(ctx.doPost(x).text);
  const one=post(request('RA-TEST-00000001'));
  assert.equal(one.success,true);assert.equal(one.orderId,'2026000100');
  assert.equal(one.requestId,'RA-TEST-00000001');
  const two=post(request('RA-TEST-00000002'));
  assert.equal(two.orderId,'2026000101');
  const repeat=post(request('RA-TEST-00000001'));
  assert.equal(repeat.orderId,'2026000100');assert.equal(repeat.duplicate,true);
  assert.equal(rows.length,3);
  assert.equal(rows[1][13],'RA-TEST-00000001');
  assert.equal(post(request('RA-TEST-00000003','1234567890')).success,false);
  assert.equal(post(request('RA-TEST-00000004','987654321')).success,false);
  assert.equal(locked,0);
  console.log('PASS Apps Script serials 2026000100 -> 2026000101, retry idempotency, 10-digit validation');
  const serverCode=fs.readFileSync('api/order.js','utf8').replace('export default async function handler','async function handler');
  async function call(body,receiverSerial=true){
    let calls=0;
    const fakeFetch=async(url,opts)=>{
      calls++;
      if(String(url).includes('postalpincode')){
        const pin=String(url).split('/').pop();
        const areas={
          '600039':['Tamil Nadu','Chennai'],
          '602001':['Tamil Nadu','Tiruvallur'],
          '631502':['Tamil Nadu','Kancheepuram'],
          '603001':['Tamil Nadu','Chengalpattu'],
          '641001':['Tamil Nadu','Coimbatore'],
          '560001':['Karnataka','Bengaluru']
        };
        const [State,District]=areas[pin]||['Tamil Nadu',''];
        return {ok:true,json:async()=>[{PostOffice:[{Pincode:pin,Country:'India',State,District}]}]};
      }
      const d=JSON.parse(opts.body);
      return {ok:true,text:async()=>JSON.stringify(receiverSerial?{success:true,orderId:'2026000100',requestId:d.orderId}:{success:true,orderId:d.orderId})};
    };
    const handler=new Function('fetch','AbortSignal','console',serverCode+';return handler;')(fakeFetch,{timeout:()=>({})},console);
    const res={code:200,setHeader(){},status(code){this.code=code;return this},json(data){return {status:this.code,...data}}};
    const outcome=await handler({method:'POST',body},res);
    return {outcome,calls};
  }
  const order={orderId:'RA-MOCK-00000001',name:'Test Customer',email:'test@example.com',mobile:'9876543210',pincode:'600039',items:[{id:'fresh',size:50,qty:1}]};
  const ok=await call(order);
  assert.equal(ok.outcome.status,200);assert.equal(ok.outcome.orderId,'2026000100');
  assert.equal(ok.outcome.requestId,order.orderId);
  assert.equal(ok.outcome.shipping,59);
  const zones=[
    ['602001',79],['631502',79],['603001',79],
    ['641001',99],['560001',149]
  ];
  for(const [pincode,expected] of zones){
    const output=await call({...order,pincode});
    assert.equal(output.outcome.status,200, 'valid shipping zone '+pincode);
    assert.equal(output.outcome.shipping,expected,'delivery charge for '+pincode);
  }
  const legacy=await call(order,false);
  assert.equal(legacy.outcome.orderId,order.orderId);
  const bad=await call({...order,mobile:'+919876543210'});
  assert.equal(bad.outcome.status,400);assert.equal(bad.calls,0);
  const badTwo=await call({...order,mobile:'987654321'});
  assert.equal(badTwo.outcome.status,400);assert.equal(badTwo.calls,0);
  console.log('PASS Vercel bridge validates district-based shipping ₹59 / ₹79 / ₹99 / ₹149 and 10-digit phone');
})().catch(e=>{console.error(e);process.exitCode=1});
