/**
 * RA PERFUMES — Google Sheets order receiver.
 * Deploy as Web app: Execute as Me; Who has access: Anyone.
 * Spreadsheet data and promo codes are preserved. New Client Request ID column is appended.
 *
 * Visible orders use YEAR + six-digit sequence; first 2026 reference is 2026000100.
 * Serial numbers are internal references, NOT an indication of historical sales.
 * Google Apps Script LockService prevents duplicate serials from simultaneous orders.
 */
const RA_SPREADSHEET_ID = '12K2bQwl3306gP4p72SbsutbmTuLVni4xbVpTsKr7rQo';
const RA_ORDER_SHEET = 'Responses';
const RA_PROMO_SHEET = 'PromoCodes';
const RA_FIRST_SEQUENCE = 100;
const RA_HEADERS = [
  'Timestamp','Order ID','Name','Email','Mobile','PIN Code','Items',
  'Subtotal (INR)','Shipping (INR)','Total (INR)','Status','Promo Code',
  'Discount (INR)','Client Request ID'
];

function raJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function raSafeText_(value) {
  const text = String(value || '').trim();
  // Prevent spreadsheet formulas supplied by untrusted customers.
  return /^[=+@]/.test(text) ? "'" + text : text;
}

function raPromo_(code, subtotal, spreadsheet) {
  const promo = String(code || '').trim().toUpperCase();
  if (!promo) return {success:true, valid:false, message:'Enter a promo code.'};
  if (!/^[A-Z0-9_-]{3,32}$/.test(promo)) return {success:true,valid:false,message:'Promo code is not valid.'};
  const sheet = spreadsheet.getSheetByName(RA_PROMO_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return {success:true, valid:false, message:'Promo code is not valid.'};
  const values = sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues();
  const found = values.find(row => String(row[0] || '').trim().toUpperCase() === promo);
  if (!found) return {success:true,valid:false,message:'Promo code is not valid.'};
  const active = String(found[4] || '').trim().toUpperCase();
  if (!['YES','TRUE','1','ACTIVE'].includes(active)) return {success:true,valid:false,message:'Promo code is no longer active.'};
  const minimum = Number(found[3] || 0);
  if (!Number.isFinite(minimum) || subtotal < minimum) return {success:true,valid:false,message:'Minimum order value not met.'};
  if (found[5]) {
    const expiry = found[5] instanceof Date ? found[5] : new Date(String(found[5]).trim().slice(0,10)+'T23:59:59');
    if (isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) return {success:true,valid:false,message:'Promo code has expired.'};
  }
  const kind = String(found[1] || '').trim().toUpperCase();
  const value = Number(found[2]);
  let discount = 0;
  if (['PERCENT','PERCENTAGE','%'].includes(kind)) discount = Math.floor(subtotal * value / 100);
  else if (['FLAT','FIXED','AMOUNT','₹','INR'].includes(kind)) discount = Math.floor(value);
  if (!Number.isFinite(discount) || discount <= 0 || discount > subtotal) return {success:true,valid:false,message:'Promo code is not valid.'};
  return {success:true,valid:true,code:promo,discount:discount,message:'Promo applied successfully.'};
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.action === 'validatePromo') {
      const subtotal = Number(params.subtotal);
      if (!Number.isFinite(subtotal) || subtotal <= 0) return raJson_({success:true,valid:false,message:'Invalid order subtotal.'});
      return raJson_(raPromo_(params.code,subtotal,SpreadsheetApp.openById(RA_SPREADSHEET_ID)));
    }
    return raJson_({success:true,service:'RA Perfumes order receiver'});
  } catch (error) {
    console.error('RA Promo GET:', error);
    return raJson_({success:false,error:'Promo validation is temporarily unavailable.'});
  }
}

function doPost(e) {
  let lock;
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const requestId = String(d.orderId || '').trim(); // Browser's idempotency key, NOT the visible serial
    const name = String(d.name || '').trim();
    const email = String(d.email || '').trim();
    const mobile = String(d.mobile || '').trim();
    const pin = String(d.pincode || '').trim();
    const items = String(d.items || '').trim();
    const subtotal = Number(d.subtotal), shipping = Number(d.shipping);
    const discount = Number(d.discount || 0), total = Number(d.total);
    const promoCode = String(d.promoCode || '').trim().toUpperCase();
    if (!/^RA-[A-Z0-9-]{8,80}$/.test(requestId) ||
        name.length < 2 || name.length > 80 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^[6-9]\d{9}$/.test(mobile) ||
        !/^[1-9]\d{5}$/.test(pin) ||
        !items || items.length > 1500 ||
        !Number.isInteger(subtotal) || subtotal < 1 ||
        !Number.isInteger(shipping) || ![59,79,99,149].includes(shipping) ||
        !Number.isInteger(discount) || discount < 0 ||
        !Number.isInteger(total) || total !== subtotal + shipping - discount) {
      return raJson_({success:false,error:'Invalid order information.'});
    }

    // The lock spans duplicate detection, number allocation, and row insertion.
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
    const book = SpreadsheetApp.openById(RA_SPREADSHEET_ID);
    let sheet = book.getSheetByName(RA_ORDER_SHEET);
    if (!sheet) {
      sheet = book.insertSheet(RA_ORDER_SHEET);
      sheet.getRange(1,1,1,RA_HEADERS.length).setValues([RA_HEADERS]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      if (sheet.getMaxColumns() < RA_HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), RA_HEADERS.length-sheet.getMaxColumns());
      // Preserve all existing columns and orders. Add just the idempotency column.
      if (String(sheet.getRange(1,14).getValue()).trim() !== 'Client Request ID') {
        sheet.getRange(1,14).setValue('Client Request ID').setFontWeight('bold');
      }
    }

    const count = Math.max(0,sheet.getLastRow()-1);
    const previous = count ? sheet.getRange(2,2,count,13).getValues() : []; // B:N
    const existing = previous.find(row => String(row[12] || '').trim() === requestId);
    if (existing) return raJson_({success:true,orderId:String(existing[0]),requestId:requestId,duplicate:true});

    // Revalidate the promo inside the same lock so an expired code cannot slip through.
    if (promoCode) {
      const verified = raPromo_(promoCode,subtotal,book);
      if (!verified.valid || verified.discount !== discount) return raJson_({success:false,error:'Promo code is not valid.'});
    } else if (discount !== 0) {
      return raJson_({success:false,error:'Invalid order discount.'});
    }

    const year = Utilities.formatDate(new Date(),Session.getScriptTimeZone() || 'Asia/Kolkata','yyyy');
    let next = RA_FIRST_SEQUENCE;
    for (const row of previous) {
      const id = String(row[0] || '').trim(); // Existing Order ID
      if (/^\d{10}$/.test(id) && id.slice(0,4) === year) {
        const n = Number(id.slice(4));
        if (Number.isInteger(n) && n >= next) next = n+1;
      }
    }
    if (next > 999999) return raJson_({success:false,error:'Order sequence exhausted.'});
    const serial = year + String(next).padStart(6,'0');
    const rowNumber=sheet.getLastRow()+1;
    sheet.getRange(rowNumber,2).setNumberFormat('@');
    sheet.appendRow([
      new Date(),serial,raSafeText_(name),raSafeText_(email),mobile,pin,raSafeText_(items),
      subtotal,shipping,total,'New',promoCode,discount,requestId
    ]);
    SpreadsheetApp.flush();
    return raJson_({success:true,orderId:serial,requestId:requestId});
  } catch (error) {
    console.error('RA order POST:', error);
    return raJson_({success:false,error:'Unable to record order. Please retry.'});
  } finally {
    if (lock) try { lock.releaseLock(); } catch (ignored) {}
  }
}
