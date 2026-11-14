// RA Perfumes. Paste into Extensions > Apps Script in the order spreadsheet.
// Run setup once. The connection key is shown to the sheet owner during setup.
const ORDER_HEADERS = ['Received', 'Order ID', 'Request ID', 'Name', 'Mobile', 'Email',
  'Delivery PIN', 'Products', 'Subtotal', 'Shipping', 'Coupon', 'Discount', 'Order total'];

function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const properties = PropertiesService.getScriptProperties();
  const name = properties.getProperty('ORDER_TAB') || 'Responses';
  let sheet = book.getSheetByName(name);
  if (sheet && sheet.getLastRow() && !headersMatch(sheet)) {
    sheet = book.getSheetByName('RA Website Orders') || book.insertSheet('RA Website Orders');
    if (sheet.getLastRow() && !headersMatch(sheet)) throw Error('RA Website Orders already has different columns.');
  }
  sheet = sheet || book.insertSheet(name);
  if (!sheet.getLastRow()) sheet.appendRow(ORDER_HEADERS);
  sheet.setFrozenRows(1);
  const key = properties.getProperty('ORDER_KEY') || Utilities.getUuid() + Utilities.getUuid();
  properties.setProperties({SHEET_ID:book.getId(), ORDER_TAB:sheet.getName(), ORDER_KEY:key});
  SpreadsheetApp.getUi().alert('Order tab: ' + sheet.getName() + '\nCopy this connection key to the Vercel environment variable RA_SHEETS_KEY:\n\n' + key);
}

function headersMatch(sheet) {
  return JSON.stringify(sheet.getRange(1,1,1,ORDER_HEADERS.length).getValues()[0]) === JSON.stringify(ORDER_HEADERS);
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (e && e.parameter.action === 'validatePromo') {
    const code = String(e.parameter.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code))
      return reply({success:true,valid:false,status:'invalid'});
    const props = PropertiesService.getScriptProperties();
    const book = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
    const sheet = book.getSheetByName('RA Coupons');
    if (!sheet || sheet.getLastRow()<2)
      return reply({success:true,valid:false,status:'invalid'});
    const rows = sheet.getRange(2,1,sheet.getLastRow()-1,4).getValues();
    const row = rows.find(r => String(r[0]||'').trim().toUpperCase()===code);
    if (!row) return reply({success:true,valid:false,status:'invalid'});
    if (row[2] !== true) return reply({success:true,valid:false,status:'expired'});
    const rate=Number(row[1]);
    if (!Number.isSafeInteger(rate)||rate<=0)
      return reply({success:true,valid:false,status:'invalid'});
    const scopes={'ALL PRODUCTS':'All products','30 ML ONLY':'30 ml only','50 ML ONLY':'50 ml only',
      '100 ML ONLY':'100 ml only','DISCOVERY SET':'Discovery Set'};
    const scope=String(row[3]||'All products').trim().toUpperCase();
    if (!scopes[scope]) return reply({success:true,valid:false,status:'invalid'});
    return reply({success:true,valid:true,status:'valid',code:code,rate:rate,
      appliesTo:scopes[scope],discount:Math.min(rate,Math.max(0,Number(e.parameter.subtotal)||0))});
  }
  return reply({success:true,service:'RA Perfumes orders'});
}

function safeText(value) {
  const text = String(value || '').trim();
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  try {
    const d = JSON.parse(e.postData.contents);
    if (!props.getProperty('ORDER_KEY') || d.connectionKey !== props.getProperty('ORDER_KEY')) return reply({success:false,error:'Unauthorized'});
    if (!/^RA-[A-Z0-9]+-[A-Z0-9]+$/.test(d.orderId) || !/^[6-9]\d{9}$/.test(d.mobile) ||
        !/^[1-9]\d{5}$/.test(d.pincode) || !d.name || !d.email || !d.items ||
        ![d.subtotal,d.shipping,d.discount,d.total].every(v=>Number.isSafeInteger(v) && v>=0) ||
        d.total !== d.subtotal + d.shipping - d.discount) return reply({success:false,error:'Invalid order'});
    lock.waitLock(8000);
    const sheet = SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheetByName(props.getProperty('ORDER_TAB'));
    if (!sheet || !headersMatch(sheet)) throw Error('Order tab needs setup');
    const last = sheet.getLastRow();
    const prior = last>1 && sheet.getRange(2,3,last-1,1).createTextFinder(d.orderId).matchEntireCell(true).findNext();
    if (prior) return reply({success:true, orderId:String(sheet.getRange(prior.getRow(),2).getValue()), requestId:d.orderId});
    const year = Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy');
    const prop = 'LAST_SERIAL_' + year;
    const serial = Number(props.getProperty(prop) || 0) + 1;
    if (serial>999999) throw Error('Serial exhausted');
    const id = year + String(serial).padStart(6,'0');
    props.setProperty(prop,String(serial));
    sheet.appendRow([new Date(),id,d.orderId,safeText(d.name),String(d.mobile),safeText(d.email),String(d.pincode),
      safeText(d.items),d.subtotal,d.shipping,safeText(d.promoCode),d.discount,d.total]);
    SpreadsheetApp.flush();
    return reply({success:true,orderId:id,requestId:d.orderId});
  } catch (err) {
    return reply({success:false,error:'Could not save order'});
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}