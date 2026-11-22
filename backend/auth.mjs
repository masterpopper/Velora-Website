import {assert,hash,token,now,challenge,cookie,sessionCookie,origin,HttpError} from './security.mjs';
function redirect(url,cookies=[]) {
  const headers=new Headers({'Location':url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  cookies.forEach(c=>headers.append('Set-Cookie',c));
  return new Response(null,{status:303,headers});
}
export async function startAuth(request,env) {
  assert(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET,503,'sign_in_not_configured');
  const state=token(), verifier=token();
  await env.DB.prepare('INSERT INTO oauth_states(hash,verifier,expires_at) VALUES(?,?,?)').bind(await hash(state),verifier,now()+600).run();
  const url=new URL('https://github.com/login/oauth/authorize');
  url.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:origin(env)+'/api/auth/callback',
    state,code_challenge:await challenge(verifier),code_challenge_method:'S256',scope:''}).toString();
  return redirect(url.toString(),[sessionCookie('__Host-valora_oauth',state,600)]);
}
export async function finishAuth(request,env) {
  const url=new URL(request.url), state=url.searchParams.get('state')||'', code=url.searchParams.get('code');
  assert(/^[a-f0-9]{64}$/.test(state) && cookie(request,'__Host-valora_oauth')===state && code,400,'oauth_state_invalid');
  const record=await env.DB.prepare('DELETE FROM oauth_states WHERE hash=? AND expires_at>? RETURNING verifier').bind(await hash(state),now()).first();
  assert(record,400,'oauth_state_expired');
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},
    body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,
      redirect_uri:origin(env)+'/api/auth/callback',code_verifier:record.verifier})});
  const result=await response.json();
  assert(response.ok && result.access_token,401,'oauth_exchange_failed');
  const profile=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+result.access_token,
    Accept:'application/vnd.github+json','User-Agent':'Velora-Account-Service'}});
  const user=await profile.json();
  assert(profile.ok && Number.isSafeInteger(user.id) && typeof user.login==='string',401,'oauth_identity_failed');
  // GitHub's immutable numeric subject, not login name or an unverified email, owns purchases.
  await env.DB.prepare(`INSERT INTO accounts(id,github_id,login,created_at) VALUES(?,?,?,?)
    ON CONFLICT(github_id) DO UPDATE SET login=excluded.login`).bind(crypto.randomUUID(),String(user.id),user.login,now()).run();
  const owner=await env.DB.prepare('SELECT id FROM accounts WHERE github_id=?').bind(String(user.id)).first();
  const session=token();
  const statements=[env.DB.prepare('INSERT INTO sessions(hash,account_id,expires_at) VALUES(?,?,?)').bind(await hash(session),owner.id,now()+86400)];
  const old=cookie(request,'__Host-valora_session');
  if(old) statements.push(env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(old)));
  await env.DB.batch(statements);
  return redirect(origin(env)+'/buy',[
    sessionCookie('__Host-valora_session',session,86400),sessionCookie('__Host-valora_oauth','',0)
  ]);
}
export async function logout(request,env) {
  await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(cookie(request,'__Host-valora_session'))).run();
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie('__Host-valora_session','',0)}});
}
