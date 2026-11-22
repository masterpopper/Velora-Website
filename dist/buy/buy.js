const $=selector=>document.querySelector(selector);
let config=null,owner=null;
const requests=new Map();
const messages={sign_in_required:'Please sign in first.',purchases_disabled:'Checkout is disabled in this private setup.',
  no_verified_purchase:'No verified purchase is available to redeem.',already_owned:'You already own this upgrade.',
  pair_code_used_or_expired:'That pairing code was used or has expired. Start a new pairing on the TV.',
  rate_limited:'Please wait before trying again.',service_unavailable:'The test service is not ready. Please try later.'};
async function api(path,method='GET',data) {
  const response=await fetch('/api'+path,{method,credentials:'same-origin',cache:'no-store',
    headers:data?{'Content-Type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});
  let result;
  try {result=await response.json();}catch{throw new Error('The private test backend is not configured on this host.');}
  if(!response.ok)throw new Error(messages[result.error]||'This action could not be completed. Check the private test configuration.');
  return result;
}
function updateDeliveries(){
  const codes={plus:'656781',theme_pack:'557432'};
  for(const sku of Object.keys(codes)){
    const confirmed=!!owner?.purchases?.some(p=>p.sku===sku&&p.state==='active'&&p.mode===owner.mode);
    const panel=$('#delivery-'+sku);
    const value=$('#delivery-code-'+sku);
    panel.hidden=!confirmed;
    if(confirmed)value.textContent=codes[sku];
  }
}
function updateButtons(){
  document.querySelectorAll('.purchase').forEach(button=>{
    const sku=button.dataset.sku,owned=!!owner?.entitlements[sku];
    button.disabled=!owner||!config?.enabled||owned;
    button.textContent=owned?'Owned':sku==='plus'?'Buy Plus':'Buy Theme Pack + Donation';
    $('#owned-'+sku).textContent=owned?'Verified on this account':'';
  });
  $('#pair-button').disabled=!owner;
  $('#mint').disabled=!owner||!(owner.entitlements.plus||owner.entitlements.theme_pack);
}
async function load(){
  try {
    config=await api('/config');
    try {owner=await api('/account');}catch{owner=null;}
    $('#account-name').textContent=owner?'Signed in as '+owner.login:'Sign in before you buy';
    $('#account-detail').textContent=owner?'Purchases belong to this account. Use the same account when linking another TV.':'GitHub sign-in identifies the owner of your purchase. No repository access is requested.';
    $('#sign-in').hidden=!!owner||!config.auth_configured;$('#sign-out').hidden=!owner;
    $('#payment-banner').textContent=config.enabled?(config.mode==='live'?'One-time purchases · USD':'Test mode · No real money moves'):'Private preparation · Purchases are not enabled';
    $('#status').textContent=config.enabled?(config.mode==='live'?'Real purchases are enabled. Review the product and amount before paying.':'Test mode only. No real money will move.'):'Checkout is disabled in this private setup.';
    const returned=new URL(location.href).searchParams.get('checkout');
    if(returned==='returned')$('#status').textContent+=' Checkout returned. Your access code appears here after Stripe confirms payment; refresh if it is still pending.';
    $('#purchases').replaceChildren();$('#devices').replaceChildren();
    for(const purchase of owner?.purchases||[]){const li=document.createElement('li');li.textContent=(purchase.sku==='plus'?'Plus':'Theme Pack + Donation')+': '+purchase.state;$('#purchases').append(li);}
    for(const dev of owner?.devices||[]){const li=document.createElement('li');li.textContent='TV '+dev.id.slice(0,8);const button=document.createElement('button');button.className='secondary';button.textContent='Unlink';button.onclick=async()=>{try{await api('/devices/revoke','POST',{device_id:dev.id});await load();}catch(e){$('#status').textContent=e.message;}};li.append(button);$('#devices').append(li);}
  }catch(error){$('#status').textContent=error.message;$('#sign-in').hidden=true;}
  updateButtons();
}
document.querySelectorAll('.purchase').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;
  const sku=button.dataset.sku;
  if(!requests.has(sku))requests.set(sku,crypto.randomUUID());
  try{const result=await api('/checkout','POST',{sku,request_id:requests.get(sku)});const dest=new URL(result.url);if(dest.origin!=='https://checkout.stripe.com')throw new Error('Unexpected checkout host.');location.assign(dest.href);}
  catch(error){$('#status').textContent=error.message;updateButtons();}
}));
$('#sign-out').addEventListener('click',async()=>{try{const r=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});if(!r.ok)throw new Error('Sign out failed.');owner=null;$('#redemption').textContent='';await load();}catch(e){$('#status').textContent=e.message;}});
$('#refresh').addEventListener('click',load);
$('#pair-form').addEventListener('submit',async event=>{event.preventDefault();const code=$('#pair-code').value.trim().toLowerCase();try{await api('/pair/approve','POST',{code});$('#pair-status').textContent='TV linked. Return to the app to sync verified purchases.';try{sessionStorage.removeItem('valora_pending_pair');}catch{}$('#pair-code').value='';await load();}catch(error){$('#pair-status').textContent=error.message;}});
$('#mint').addEventListener('click',async()=>{try{const result=await api('/redemption','POST',{});$('#redemption').textContent=result.code+' — expires in 10 minutes. Single use.';}catch(error){$('#redemption').textContent=error.message;}});
const initial=new URL(location.href),pair=initial.searchParams.get('pair');
try {if(pair&&/^[a-f0-9]{32}$/.test(pair))sessionStorage.setItem('valora_pending_pair',pair);$('#pair-code').value=sessionStorage.getItem('valora_pending_pair')||'';}catch{/* Storage unavailable: visitors can paste the code. */}
if(pair){initial.searchParams.delete('pair');history.replaceState(null,'',initial.pathname+initial.search);}
load();

