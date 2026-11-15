import type { Connection, Note } from '../../types';
import { connectionDirection } from '../connections/connectionData';
import { parseNoteContent } from '../../utils';

export function noteRowTitle(note: Note | undefined): string {
  if (!note) return '（便签已删除）';
  return parseNoteContent(note.text || '').title || '无标题';
}

export function edgeDirectionHint(connection: Connection): string {
  const direction = connectionDirection(connection);
  if (direction === 'forward') return '→';
  if (direction === 'backward') return '←';
  if (direction === 'both') return '↔';
  return '—';
}

export function sanitizeTableExportFilenamePart(value: string): string {
  const sanitized = value.trim().replace(/[/\\?%*:|"<>]/g, '_');
  return sanitized.slice(0, 80) || 'table';
}

export function escapeTableCsvCell(value: string | number | undefined | null): string {
  const stringValue = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

export function buildTableCsv(rows: (string | number | undefined | null)[][]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeTableCsvCell).join(',')).join('\r\n')}`;
}

export function formatTableNoteYearRange(note: Note): string {
  const { startYear, endYear } = note;
  if (startYear != null && endYear != null) return `${startYear}-${endYear}`;
  if (startYear != null) return String(startYear);
  if (endYear != null) return String(endYear);
  return '';
}

export function triggerTableCsvDownload(filename: string, csvBody: string) {
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
