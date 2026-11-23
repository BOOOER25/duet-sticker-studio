import {build} from 'esbuild';
import {copyFile,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await build({entryPoints:{app:'main.js','cutout-worker':'cutout-source.js'},bundle:true,format:'esm',outdir:'.',minify:true,target:'es2022',legalComments:'linked'});
await copyFile('node_modules/@imgly/background-removal/LICENSE.md','LICENSE.md');
const version=createHash('sha256').update(await readFile('app.js')).digest('hex').slice(0,12);
const html=await readFile('index.html','utf8');
await writeFile('index.html',html.replace(/src="\.\/app\.js(?:\?v=[a-f0-9]+)?"/,`src="./app.js?v=${version}"`));
console.log('Built app.js and cutout-worker.js. Static project is ready.');
