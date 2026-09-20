import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const result = await build({
  entryPoints: ['tests/camera-flow.test.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [{
    name: 'camera-test-window',
    setup(build) {
      // Test the actual hooks, media store and viewfinder. Only replace the
      // portal/animation shell; its children deliberately mount one effect late.
      build.onResolve({ filter: /\/ChromeWindow$/ }, () => ({ path: 'window', namespace: 'test-shell' }));
      build.onLoad({ filter: /.*/, namespace: 'test-shell' }, () => ({
        contents: `import React, {useState,useEffect} from 'react';
          export function ChromeWindow({open,children}) {
            const [present,setPresent]=useState(false);
            useEffect(()=>setPresent(open),[open]);
            return present ? React.createElement('div',null,children) : null;
          }`,
        resolveDir: process.cwd()
      }));
    }
  }]
});
const filename = path.resolve('tests/.camera-test.cjs');
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(result.outputFiles[0].text, filename);
