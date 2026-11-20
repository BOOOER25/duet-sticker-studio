import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:{app:'main.js','cutout-worker':'cutout-source.js'},bundle:true,format:'esm',outdir:'.',minify:true,target:'es2022',legalComments:'linked'});
await copyFile('node_modules/@imgly/background-removal/LICENSE.md','LICENSE.md');
console.log('Built app.js and cutout-worker.js. Static project is ready.');
