import assert from 'node:assert/strict';
import {
  buildTableCsv,
  escapeTableCsvCell,
  sanitizeTableExportFilenamePart
} from '../utils/table/tableExport';

assert.equal(escapeTableCsvCell('simple'), 'simple');
assert.equal(escapeTableCsvCell('a,b'), '"a,b"');
assert.equal(escapeTableCsvCell('say "hi"'), '"say ""hi"""');
assert.equal(escapeTableCsvCell(undefined), '');
assert.equal(buildTableCsv([['标题', '含,逗号'], ['A', 2]]), '\uFEFF标题,"含,逗号"\r\nA,2');
assert.equal(sanitizeTableExportFilenamePart(' /invalid:name? '), '_invalid_name_');
assert.equal(sanitizeTableExportFilenamePart('   '), 'table');

console.log('PASS: table CSV export preserves escaping, BOM, and safe filenames');
