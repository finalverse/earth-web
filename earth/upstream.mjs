// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const maintained='https://github.com/finalverse/gods-eye-view.git';
const lock=JSON.parse(await readFile(new URL('./globe.lock.json',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(lock.repository!==maintained||!/^[a-f0-9]{40}$/.test(lock.commit))throw new Error('Invalid maintained globe pin.');
const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});
const [command='verify',commit,output]=process.argv.slice(2);
if(command==='verify'){
  for(const [path,digest] of Object.entries(lock.files))if(hash(await readFile(resolve(root,path)))!==digest)throw new Error(`Pinned globe source changed: ${path}. Review and update the maintained-source pin.`);
  const packages=JSON.parse(await readFile(resolve(root,'package-lock.json'))).packages;
  for(const [name,version] of Object.entries(lock.npm))if(packages[`node_modules/${name}`]?.version!==version)throw new Error(`Globe dependency changed: ${name}`);
  console.log(`Verified maintained globe ${lock.commit}: ${Object.keys(lock.files).length} source/license/data files and locked renderer dependencies.`);
}else if(command==='fetch'||command==='prepare'){
  const sha=command==='fetch'?lock.commit:commit;
  if(!/^[a-f0-9]{40}$/.test(sha||''))throw new Error('A full reviewed maintained-fork commit is required.');
  git(['fetch','--no-tags',maintained,sha]);
  const candidate={...lock,commit:sha,files:{}};
  for(const path of Object.keys(lock.files))candidate.files[path]=hash(git(['show',`${sha}:${path}`]));
  if(command==='fetch'){
    if(JSON.stringify(candidate.files)!==JSON.stringify(lock.files))throw new Error('Maintained source does not match the recorded pin.');
    console.log('Maintained remote commit matches the source pin.');
  }else{
    if(!output)throw new Error('Choose a patch path outside the source tree; no files are applied automatically.');
    await writeFile(output,git(['diff',lock.commit,sha,'--',...Object.keys(lock.files)]),{flag:'wx'});
    await writeFile(output+'.lock.json',JSON.stringify(candidate,null,2)+'\n',{flag:'wx'});
    console.log('Prepared source patch and candidate lock for review. No source files were changed.');
  }
}else throw new Error('Usage: upstream.mjs verify | fetch | prepare <full-sha> <patch-path>');
