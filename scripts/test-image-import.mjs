import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const result = await build({
  entryPoints: ['tests/image-import.test.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [{
    name: 'import-dialog-shell',
    setup(build) {
      // Only animation/portal shells are substituted; import, EXIF, hashing and storage are real.
      build.onResolve({ filter: /\/ChromeSheetPresence$/ }, () => ({ path: 'presence', namespace: 'test-shell' }));
      build.onResolve({ filter: /\/ChromeDialogSurface$/ }, () => ({ path: 'surface', namespace: 'test-shell' }));
      build.onLoad({ filter: /.*/, namespace: 'test-shell' }, () => ({
        contents: `import React from 'react';
          export const ChromePresence = ({open,children}) => open ? children('open') : null;
          export const ChromeDialogSurface = ({children,...props}) => React.createElement('div',props,children);`,
        resolveDir: process.cwd()
      }));
    }
  }]
});
const filename = path.resolve('tests/.image-import-test.cjs');
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(result.outputFiles[0].text, filename);
