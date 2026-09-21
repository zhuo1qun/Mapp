import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

const result = await build({
  entryPoints: ['tests/note-draft.test.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external'
});
const filename = path.resolve('tests/.note-draft-test.cjs');
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(result.outputFiles[0].text, filename);
