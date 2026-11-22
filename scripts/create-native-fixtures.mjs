import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function createNativeFixtures({issuer='https://veloratv.app',deviceId='local-test-device',accountId='local-test-account'}={}) {
  if(new URL(issuer).protocol!=='https:' || new URL(issuer).origin!==issuer)throw new Error('Issuer must be an exact HTTPS origin.');
  const {privateKey,publicKey}=await generateKeyPair('ES256',{extractable:true}),kid='ephemeral-native-test-only';
  const publicJwk={...await exportJWK(publicKey),kid,alg:'ES256',use:'sig'},time=Math.floor(Date.now()/1000);
  const claims={schema:1,mode:'test',package:'app.velora.tv',device_id:deviceId,entitlements:{plus:true,theme_pack:true}};
  const sign=async({payload={},iss=issuer,aud='app.velora.tv.test',iat=time,exp=time+3600}={})=>
    new SignJWT({...claims,...payload}).setProtectedHeader({alg:'ES256',typ:'JWT',kid}).setIssuer(iss).setAudience(aud)
      .setSubject(accountId).setIssuedAt(iat).setExpirationTime(exp).setJti(crypto.randomUUID()).sign(privateKey);
  const valid=await sign(),pieces=valid.split('.');
  pieces[2]=(pieces[2][0]==='A'?'B':'A')+pieces[2].slice(1);
  return {warning:'OFFLINE TEST FIXTURES ONLY. No purchase, production trust or saved private key.',
    issuer,expected_audience:'app.velora.tv.test',expected_device_id:deviceId,expected_account_id:accountId,
    generated_at:time,jwks:{keys:[publicJwk]},cases:[
      {name:'valid',accept:true,token:valid},
      {name:'tampered_signature',accept:false,token:pieces.join('.')},
      {name:'expired',accept:false,token:await sign({iat:time-7200,exp:time-3600})},
      {name:'wrong_issuer',accept:false,token:await sign({iss:'https://wrong-issuer.example'})},
      {name:'wrong_audience',accept:false,token:await sign({aud:'app.velora.tv'})},
      {name:'wrong_device',accept:false,token:await sign({payload:{device_id:'another-device'}})},
      {name:'wrong_package',accept:false,token:await sign({payload:{package:'other.package'}})},
      {name:'future_issued',accept:false,token:await sign({iat:time+7200,exp:time+10800})},
      {name:'too_long_lived',accept:false,token:await sign({exp:time+86400})},
      {name:'wrong_mode',accept:false,token:await sign({payload:{mode:'live'}})},
      {name:'wrong_schema',accept:false,token:await sign({payload:{schema:99}})},
      {name:'malformed_boolean',accept:false,token:await sign({payload:{entitlements:{plus:'true',theme_pack:false}}})}
    ]};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const output=option('--output');if(!output)throw new Error('Pass --output PATH. Optional --issuer HTTPS_ORIGIN --device-id ID --account-id ID.');
  const result=await createNativeFixtures({issuer:option('--issuer'),deviceId:option('--device-id'),accountId:option('--account-id')});
  await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(resolve(output),JSON.stringify(result,null,2));
  console.log('Wrote public keys and 12 signed offline test cases to '+resolve(output)+'. No private key saved.');
}
