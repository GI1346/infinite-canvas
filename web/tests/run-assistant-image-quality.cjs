const path=require('node:path'),{buildSync}=require('esbuild'),{execFileSync}=require('node:child_process');
const web=path.resolve(__dirname,'..'),outfile=path.join(web,'.checks/assistant-image-quality.cjs');
buildSync({absWorkingDir:web,entryPoints:['tests/assistant-image-quality.check.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'copy-to-clipboard':path.join(web,'node_modules/copy-to-clipboard/dist/index.mjs')},outfile});
execFileSync(process.execPath,['--require',path.join(web,'tests/channel-protocol-dom.cjs'),outfile],{stdio:'inherit',cwd:web});
