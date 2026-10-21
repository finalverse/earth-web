import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url)));
const schema=await read('./fsip-0.1.schema.json');
const integer=max=>({type:'number',validate:n=>Number.isSafeInteger(n)&&n>=0&&n<=max});
const ajv=new Ajv2020({strict:true,formats:{uuid:/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,'date-time':s=>Number.isFinite(Date.parse(s)),double:{type:'number',validate:Number.isFinite},uint16:integer(65535),uint32:integer(4294967295),uint64:integer(Number.MAX_SAFE_INTEGER)}});
const check=ajv.compile(schema);
const fixture={type:'experience',data:await read('./fixtures/virtual-experience.json')};
test('Rust-generated FSIP 0.1 schema accepts the redacted native-flow fixture',()=>{
  assert.ok(check(fixture),JSON.stringify(check.errors));
  assert.equal(fixture.data.source_workspace,null);
  assert.equal(fixture.data.transform.source_context,null);
});
test('schema refuses unknown operations, protocol versions, asset fields and IDs',()=>{
  for(const change of [x=>x.type='execute_python',x=>x.data.protocol_version='9.0',x=>x.data.exec='bad',x=>x.data.objects[0].asset.url='https://invalid.example/model',x=>x.data.experience_id='not-a-uuid']){
    const bad=structuredClone(fixture);change(bad);assert.equal(check(bad),false);
  }
});
