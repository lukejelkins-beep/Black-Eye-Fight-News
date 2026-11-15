import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePhotoCandidates,validateCommonsImageMetadata,creditsDocument}
 from '../scripts/sumo-stage-cc-photos-preview.mjs';
const data=JSON.parse(readFileSync(new URL('../data/sumo/photo-candidates-cc.json',import.meta.url),'utf8'));
const roster=JSON.parse(readFileSync(new URL('../data/sumo/rikishi-index.json',import.meta.url),'utf8'));
const c=data.candidates.find(x=>x.shikonaEn==='Ura');
const api={query:{pages:{'123':{title:'File:Ura Kazuki 2017.jpg',
 imageinfo:[{size:362783,url:'https://upload.wikimedia.org/wikipedia/commons/c/c5/Ura_Kazuki_2017.jpg',
 extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'}}}]}}}};
test('vetted photo candidates have exact identity, Creative Commons source and local destination',()=>{
 assert.equal(validatePhotoCandidates(data,roster),true);
 assert.equal(data.candidates.length,8);
 assert.equal(data.productionPublished,false);
 assert.equal(data.approvedForPublication,false);
 assert.throws(()=>validatePhotoCandidates({...data,
  candidates:[{...c,officialNskId:1}]},roster),/identity mismatch/);
 assert.throws(()=>validatePhotoCandidates({...data,
  candidates:[{...c,license:'Copyright all rights reserved'}]},roster),/Untrusted/);
 assert.throws(()=>validatePhotoCandidates({...data,
  candidates:[{...c,commonsPage:'https://example.com/ura.jpg'}]},roster),/Untrusted/);
});
test('Wikimedia image metadata requires exact filename, license, size and original host',()=>{
 const good=validateCommonsImageMetadata(c,api);
 assert.equal(good.license,'CC BY-SA 4.0');
 assert.equal(good.size,362783);
 assert.match(good.url,/^https:\/\/upload\.wikimedia\.org/);
 const mutated=fn=>{const x=structuredClone(api);fn(x.query.pages['123'].imageinfo[0]);return x;};
 assert.throws(()=>validateCommonsImageMetadata(c,mutated(x=>{
  x.extmetadata.LicenseShortName.value='CC BY-NC-ND 4.0';})),/License/);
 assert.throws(()=>validateCommonsImageMetadata(c,mutated(x=>{x.size=90000000;})),/size/);
 assert.throws(()=>validateCommonsImageMetadata(c,mutated(x=>{
  x.url='https://untrusted.example/ura.jpg';})),/original/);
 assert.throws(()=>validateCommonsImageMetadata(c,{
  query:{pages:{'123':{...api.query.pages['123'],title:'File:Other.jpg'}}}}),/identity/);
});
test('photo credits expose author, original file, license and modifications without unlicensed images',()=>{
 const page=creditsDocument({bySourceId:{
  '28':{approved:true,name:'Ura',author:'FourTildes',sourceUrl:c.commonsPage,
   changes:'None; original JPEG retained',license:'CC BY-SA 4.0'},
  '8850':{approved:false,name:'Unlicensed portrait',sourceUrl:c.commonsPage}}});
 assert.match(page,/FourTildes/);
 assert.match(page,/Ura_Kazuki_2017\.jpg/);
 assert.match(page,/creativecommons\.org\/licenses\/by-sa\/4\.0/);
 assert.match(page,/None; original JPEG retained/);
 assert.doesNotMatch(page,/Unlicensed portrait/);
 assert.match(page,/test website/);
});
