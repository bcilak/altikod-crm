import { inflateRawSync } from 'node:zlib';
import { messageAttachmentTypes, type MessageAttachmentExtension } from '@saleshub/shared';
import { sniff } from '../delivery/knowledge.service';

type MimeType = keyof typeof messageAttachmentTypes;
export type Detected = { mimeType: MimeType; extension: MessageAttachmentExtension };
export class FileTypeError extends Error {}

const unsupported = 'Yalnız PDF, PNG, JPEG, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), CSV ve TXT dosyaları eklenebilir';
const ooxml: Record<'docx' | 'xlsx' | 'pptx', { main: string; mimeType: MimeType }> = {
  docx: { main: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { main: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { main: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
};
const bad = (message = 'Dosya bozuk veya desteklenmeyen biçimde') => new FileTypeError(message);

/** Reads only the ZIP central directory and [Content_Types].xml (size-capped) to identify an Office Open XML file and reject macros. */
function officeType(bytes: Buffer): 'docx' | 'xlsx' | 'pptx' {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw bad();
  const entries = bytes.readUInt16LE(eocd + 10); const cdOffset = bytes.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cdOffset === 0xffffffff || entries > 5000) throw bad('ZIP64 veya çok sayıda parça içeren dosyalar kabul edilmez');
  let at = cdOffset; let contentTypes: { method: number; size: number; uncompressed: number; local: number } | undefined;
  for (let n = 0; n < entries; n++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) throw bad();
    const flags = bytes.readUInt16LE(at + 8); const method = bytes.readUInt16LE(at + 10);
    const size = bytes.readUInt32LE(at + 20); const uncompressed = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28); const extra = bytes.readUInt16LE(at + 30); const comment = bytes.readUInt16LE(at + 32);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    if (flags & 1) throw bad('Şifreli dosyalar taranamadığı için kabul edilmez');
    if (/(^|\/)vba(project\.bin|data\.xml)$/i.test(name)) throw bad('Makro içeren Office dosyaları kabul edilmez');
    if (name === '[Content_Types].xml') contentTypes = { method, size, uncompressed, local: bytes.readUInt32LE(at + 42) };
    at += 46 + nameLength + extra + comment;
  }
  if (!contentTypes) throw bad(unsupported);
  if (contentTypes.uncompressed > 1024 * 1024) throw bad();
  const { local, method, size } = contentTypes;
  if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) throw bad();
  const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  const data = bytes.subarray(start, start + size);
  let xml: string;
  try { xml = (method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: 1024 * 1024 }) : (() => { throw bad(); })()).toString('utf8'); }
  catch (error) { if (error instanceof FileTypeError) throw error; throw bad(); }
  if (/macroEnabled/i.test(xml)) throw bad('Makro içeren Office dosyaları kabul edilmez');
  const kind = (Object.keys(ooxml) as (keyof typeof ooxml)[]).find(k => xml.includes(ooxml[k].main));
  if (!kind) throw bad(unsupported);
  return kind;
}

/** UTF-8 (optional BOM) text with no binary control characters. */
function isPlainText(bytes: Buffer) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return false; }
  return !bytes.some(b => b < 32 && b !== 9 && b !== 10 && b !== 13 && b !== 12);
}

/**
 * Decides the type from content; the name's extension must agree with it, so a renamed file is rejected rather than
 * relabelled. CSV and TXT have no signature, so for them the extension selects between the two text types.
 */
export function detectMessageFile(bytes: Buffer, name: string): Detected {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase().replace(/^jpeg$/, 'jpg');
  const binary = sniff(bytes);
  let detected: Detected;
  if (binary) detected = binary;
  else if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) { const kind = officeType(bytes); detected = { mimeType: ooxml[kind].mimeType, extension: kind }; }
  else if ((extension === 'csv' || extension === 'txt') && isPlainText(bytes)) return { mimeType: extension === 'csv' ? 'text/csv' : 'text/plain', extension };
  else throw bad(unsupported);
  if (extension !== detected.extension) throw bad(`Dosya uzantısı içeriğiyle uyuşmuyor; bu bir ${detected.extension.toUpperCase()} dosyası`);
  return detected;
}
