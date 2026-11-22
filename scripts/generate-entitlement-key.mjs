// Owner-run utility. Private key goes only to Windows clipboard, never stdout or disk.
import {generateKeyPair,exportJWK} from 'jose';
import {spawnSync} from 'node:child_process';
if(process.platform!=='win32') throw new Error('Use a trusted local secret-manager key generator on this platform; refusing to print a private key.');
const pair=await generateKeyPair('ES256',{extractable:true});
const privateJwk=JSON.stringify(await exportJWK(pair.privateKey));
const publicJwk=JSON.stringify(await exportJWK(pair.publicKey));
const copy=spawnSync('clip.exe',[],{input:privateJwk,encoding:'utf8',windowsHide:true});
if(copy.error||copy.status!==0) throw new Error('Clipboard copy failed. No private key has been printed or saved.');
console.log('Private JWK copied to clipboard only. Paste into Cloudflare encrypted ENTITLEMENT_PRIVATE_JWK, save, then clear clipboard/history.');
console.log('Public-only ENTITLEMENT_PUBLIC_JWK:');
console.log(publicJwk);
