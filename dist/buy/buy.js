const $=selector=>document.querySelector(selector);
const buttons=[...document.querySelectorAll('.purchase')];
let config=null;
const requests=new Map();
function showDelivery(sku,code){
  const panel=$('#delivery-'+sku);
  if(panel){panel.hidden=false;$('#delivery-code-'+sku).textContent=code;}
  $('#receipt').hidden=false;
  $('#receipt-title').textContent='Payment confirmed';
  $('#receipt-message').textContent='Your '+(sku==='plus'?'Plus':'Theme Pack')+' payment has been verified by Stripe. Your delivery code is shown above.';
}
async function api(path,options={}){
  const response=await fetch('/api'+path,{credentials:'same-origin',cache:'no-store',...options,
    headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok)throw new Error(data.error||'The payment service is temporarily unavailable.');
  return data;
}
async function checkSession(sessionId){
  $('#receipt').hidden=false;
  $('#receipt-title').textContent='Checking your payment…';
  $('#receipt-message').textContent='Waiting for Stripe to confirm your payment. This can take a few seconds.';
  let lastError=null;
  for(let attempt=0;attempt<18;attempt++){
    try{
      const result=await api('/purchase/status?session_id='+encodeURIComponent(sessionId));
      lastError=null;
      if(result.status==='paid'&&['plus','theme_pack'].includes(result.sku)&&typeof result.code==='string'){showDelivery(result.sku,result.code);return;}
      if(['failed','expired','suspended','revoked'].includes(result.status)){
        $('#receipt-title').textContent='Payment not eligible for code delivery';
        $('#receipt-message').textContent='The payment is '+result.status+'. Contact Velora support if you believe this is incorrect.';
        return;
      }
    }catch(error){lastError=error.message;$('#receipt-message').textContent='Unable to verify payment: '+error.message+'. Do not pay again.';}
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  if(lastError){
    $('#receipt-title').textContent='Payment verification needs attention';
    $('#receipt-message').textContent='Unable to verify payment: '+lastError+'. Do not pay again. Use Check payment again or contact Velora support with this error.';
    return;
  }
  $('#receipt-title').textContent='Payment is still processing';
  $('#receipt-message').textContent='Stripe has not confirmed the payment yet. Use “Check payment again” in a moment. Your code will appear automatically after confirmation.';
}
async function load(){
  try{
    config=await api('/config');
    const enabled=!!config.enabled;
    $('#payment-banner').textContent=enabled?(config.mode==='live'?'Secure one-time purchases · USD':'Stripe test mode · No real money moves'):'Purchases are temporarily unavailable';
    $('#status').textContent=enabled?'Choose an upgrade to continue to secure Stripe Checkout.':'The store is not enabled yet.';
    buttons.forEach(button=>button.disabled=!enabled);
  }catch(error){$('#status').textContent=error.message;$('#payment-banner').textContent='Payment service unavailable';}
  const params=new URL(location.href).searchParams;
  const sessionId=params.get('session_id');
  if(sessionId)await checkSession(sessionId);
  else if(params.get('checkout')==='cancelled'){$('#status').textContent='Checkout was cancelled. You have not been charged.';}
}
buttons.forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;const sku=button.dataset.sku;
  if(!requests.has(sku))requests.set(sku,crypto.randomUUID());
  const requestId=requests.get(sku);
  try{
    const result=await api('/checkout',{method:'POST',body:JSON.stringify({sku,request_id:requestId})});
    const destination=new URL(result.url);
    if(destination.origin!=='https://checkout.stripe.com')throw new Error('Unexpected Stripe Checkout destination.');
    location.assign(destination.href);
  }catch(error){$('#status').textContent=error.message;button.disabled=!config?.enabled;}
}));
$('#check-again').addEventListener('click',()=>{const id=new URL(location.href).searchParams.get('session_id');if(id)checkSession(id);});
load();
