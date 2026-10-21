// Generate TypeScript from the same schema exported by the Rust wire types.
import { readFile, writeFile } from 'node:fs/promises';
const schema = JSON.parse(await readFile(new URL('./fsip-0.1.schema.json', import.meta.url)));
function type(s) {
  if (s.$ref) return s.$ref.split('/').at(-1);
  if ('const' in s) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map(x=>JSON.stringify(x)).join(' | ');
  if (s.oneOf || s.anyOf) return (s.oneOf || s.anyOf).map(type).join(' | ');
  if (Array.isArray(s.type)) return s.type.map(t=>type({...s,type:t})).join(' | ');
  if (s.type==='null') return 'null';
  if (s.type==='string') return 'string';
  if (s.type==='boolean') return 'boolean';
  if (s.type==='integer'||s.type==='number') return 'number';
  if (s.type==='array') return s.prefixItems ? '['+s.prefixItems.map(type).join(', ')+']' :
    '('+type(s.items)+')[]';
  if (s.type==='object') return '{ '+Object.entries(s.properties??{}).map(([k,v])=>
    JSON.stringify(k)+((s.required??[]).includes(k)?'':'?')+': '+type(v)).join('; ')+' }';
  throw new Error('Unsupported schema node '+JSON.stringify(s));
}
const text='// Generated from FSIP 0.1 Rust types. Do not edit.\n'+
  Object.entries(schema.$defs).map(([name,s])=>'export type '+name+' = '+type(s)+';').join('\n')+
  '\nexport type Document = '+type(schema)+';\n';
await writeFile(new URL('../../packages/fsip/src/index.ts',import.meta.url),text);
