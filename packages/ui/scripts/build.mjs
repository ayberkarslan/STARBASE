import {spawnSync} from 'node:child_process';
import {copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const commands=[[join(dirname(require.resolve('vite/package.json')),'bin/vite.js'),'build','--config',root+'vite.config.ts'],[join(dirname(require.resolve('typescript/package.json')),'bin/tsc'),'-p',root+'tsconfig.build.json']];
for(const args of commands){const run=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(run.status!==0)process.exit(run.status??1)}
copyFileSync(root+'src/index.d.ts',root+'dist/index.d.ts');
