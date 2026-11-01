const phoneForm = document.querySelector('#phone-form');
const codeForm = document.querySelector('#code-form');
const statusLine = document.querySelector('#status');
const nextPage = 'checkout.html' + location.search;
if (!phoneAuth.enabled) location.replace(nextPage);
let phone;
phoneForm.onsubmit = async event => {
  event.preventDefault();
  phone = document.querySelector('#phone').value.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{9,14}$/.test(phone)) {
    statusLine.textContent = 'Enter a mobile number with its country code.';
    return;
  }
  const button = phoneForm.querySelector('button');
  button.disabled = true;
  try {
    await phoneAuth.request('otp', {phone, channel:'sms', create_user:true});
    codeForm.hidden = false;
    statusLine.textContent = 'Enter the code sent to ' + phone + '.';
    document.querySelector('#code').focus();
    button.textContent = 'Send another code';
  } catch {statusLine.textContent = 'Could not send the code. Check your number and try again.';}
  finally {button.disabled = false;}
};
codeForm.onsubmit = async event => {
  event.preventDefault();
  const button = codeForm.querySelector('button');
  button.disabled = true;
  try {
    const result = await phoneAuth.request('verify', {phone, token:document.querySelector('#code').value.trim(), type:'sms'});
    if (!result.access_token) throw new Error();
    sessionStorage.setItem('ra-auth', result.access_token);
    location.replace(nextPage);
  } catch {statusLine.textContent = 'Code could not be verified. Try again or request a new code.';button.disabled=false;}
};
