import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/buy/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../dist/buy/buy.js',import.meta.url),'utf8');
test('buyer page has no GitHub sign-in and does not expose delivery codes before payment',()=>{
  assert.doesNotMatch(html,/Sign in with GitHub|GitHub OAuth/i);
  assert.doesNotMatch(html,/656781|557432/);
  assert.doesNotMatch(js,/656781|557432/);
  assert.match(js,/purchase\/status\?session_id=/);
});
