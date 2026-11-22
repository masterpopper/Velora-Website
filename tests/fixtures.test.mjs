import test from 'node:test';
import assert from 'node:assert/strict';
import {jwtVerify,importJWK} from 'jose';
import {createNativeFixtures} from '../scripts/create-native-fixtures.mjs';
test('native fixture generator covers required validation failures without exporting a private key',async()=>{
  const result=await createNativeFixtures();assert.equal(result.jwks.keys[0].d,undefined);
  const key=await importJWK(result.jwks.keys[0],'ES256');
  const good=await jwtVerify(result.cases.find(x=>x.name==='valid').token,key,{issuer:'https://veloratv.app',audience:'app.velora.tv.test',algorithms:['ES256']});
  assert.equal(good.payload.device_id,'local-test-device');assert.equal(result.cases.length,12);
  await assert.rejects(jwtVerify(result.cases.find(x=>x.name==='expired').token,key));
  await assert.rejects(jwtVerify(result.cases.find(x=>x.name==='tampered_signature').token,key));
});
