import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { BSON, type Document } from 'mongodb';
import type { TransferFormat } from '../shared/transfer';

const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export function documentOf(value: unknown): Document {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error('Expected a document object.');
  }
  return value as Document;
}
export function jsonDocument(text: string): Document {
  return documentOf(BSON.EJSON.parse(text, { relaxed: false }));
}
export function jsonText(document: Document): string {
  return BSON.EJSON.stringify(document, { relaxed: false });
}
export function csvCell(value: unknown): string {
  const text =
    value === undefined
      ? ''
      : value !== null && typeof value === 'object'
        ? BSON.EJSON.stringify(value, { relaxed: false })
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Incremental CSV tokenizer, including quoted newlines and chunk-split quotes/CRLF. */
export async function* csvRows(chunks: AsyncIterable<string>): AsyncGenerator<string[]> {
  let row: string[] = [];
  let field = '';
  let state: 'plain' | 'quoted' | 'closed' = 'plain';
  let skipLf = false;
  let first = true;
  let touched = false;
  let rowLength = 0;
  for await (const chunk of chunks) {
    for (const char of chunk) {
      if (first) {
        first = false;
        if (char === '\uFEFF') continue;
      }
      if (skipLf) {
        skipLf = false;
        if (char === '\n') continue;
      }
      touched = true;
      rowLength++;
      if (rowLength > MAX_DOCUMENT_BYTES) throw new Error('CSV row exceeds 64 MiB.');
      if (state === 'quoted') {
        if (char === '"') state = 'closed';
        else field += char;
      } else if (state === 'closed' && char === '"') {
        field += '"';
        state = 'quoted';
      } else if (char === ',') {
        row.push(field);
        field = '';
        state = 'plain';
      } else if (char === '\r' || char === '\n') {
        row.push(field);
        yield row;
        row = [];
        field = '';
        state = 'plain';
        touched = false;
        rowLength = 0;
        skipLf = char === '\r';
      } else if (state === 'closed') {
        throw new Error('Unexpected character after a quoted CSV field.');
      } else if (char === '"') {
        if (field !== '') throw new Error('Unexpected quote in a CSV field.');
        state = 'quoted';
      } else field += char;
      if (field.length > MAX_DOCUMENT_BYTES) throw new Error('CSV field exceeds 64 MiB.');
    }
  }
  if (state === 'quoted') throw new Error('Unterminated quoted CSV field.');
  if (touched || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/** Tokenize top-level objects without buffering a complete JSON file. */
export async function* jsonDocuments(chunks: AsyncIterable<string>): AsyncGenerator<Document> {
  let mode: 'start' | 'array' | 'sequence' | 'done' = 'start';
  let expect: 'valueOrEnd' | 'value' | 'separator' = 'valueOrEnd';
  let text = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let separator = false;
  let first = true;
  let count = 0;
  for await (const chunk of chunks) {
    for (const char of chunk) {
      if (first) {
        first = false;
        if (char === '\uFEFF') continue;
      }
      if (depth > 0) {
        text += char;
        if (text.length > MAX_DOCUMENT_BYTES) throw new Error('JSON document exceeds 64 MiB.');
        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') inString = false;
        } else if (char === '"') inString = true;
        else if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') depth--;
        if (depth === 0) {
          count++;
          try {
            yield jsonDocument(text);
          } catch (error) {
            throw new Error(
              `JSON document ${count}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
          text = '';
          expect = 'separator';
          separator = false;
        }
        continue;
      }
      if (/\s/.test(char)) {
        if (char === '\n' || char === '\r') separator = true;
        continue;
      }
      if (mode === 'done') throw new Error('Unexpected content after JSON array.');
      if (mode === 'start') {
        if (char === '[') {
          mode = 'array';
          continue;
        }
        mode = 'sequence';
      }
      if (mode === 'array') {
        if (char === ']' && expect !== 'value') {
          mode = 'done';
          continue;
        }
        if (char === ',' && expect === 'separator') {
          expect = 'value';
          continue;
        }
        if (expect === 'separator') throw new Error('Expected a comma between JSON documents.');
      } else if (expect === 'separator' && !separator) {
        throw new Error('JSON documents must be separated by newlines.');
      }
      if (char !== '{') throw new Error(`Expected document object ${count + 1}.`);
      text = '{';
      depth = 1;
      inString = false;
      escaped = false;
    }
  }
  if (depth !== 0 || mode === 'array') throw new Error(`Incomplete JSON at document ${count + 1}.`);
  if (mode === 'start') throw new Error('JSON file is empty.');
}

export async function* readDocuments(
  filePath: string,
  format: TransferFormat,
  onBytes: (bytes: number) => void,
  signal: AbortSignal
): AsyncGenerator<Document> {
  if (format === 'bson') {
    const file = await open(filePath, 'r');
    let bytes = 0;
    async function readExact(buffer: Buffer): Promise<number> {
      let offset = 0;
      while (offset < buffer.length) {
        signal.throwIfAborted();
        const result = await file.read(buffer, offset, buffer.length - offset, null);
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
        bytes += result.bytesRead;
        onBytes(bytes);
      }
      return offset;
    }
    try {
      while (true) {
        const prefix = Buffer.alloc(4);
        const n = await readExact(prefix);
        if (n === 0) break;
        if (n !== 4) throw new Error(`Truncated BSON length at byte ${bytes}.`);
        const size = prefix.readInt32LE();
        if (size < 5 || size > 16 * 1024 * 1024)
          throw new Error(`Invalid BSON document size ${size} at byte ${bytes - 4}.`);
        const buffer = Buffer.allocUnsafe(size);
        prefix.copy(buffer);
        if ((await readExact(buffer.subarray(4))) !== size - 4)
          throw new Error(`Truncated BSON document at byte ${bytes}.`);
        yield BSON.deserialize(buffer, { promoteValues: false, promoteLongs: false });
      }
    } finally {
      await file.close();
    }
    return;
  }
  const stream = createReadStream(filePath, { encoding: 'utf8', signal });
  let bytes = 0;
  async function* chunks(): AsyncGenerator<string> {
    for await (const chunk of stream) {
      const text = chunk as string;
      bytes += Buffer.byteLength(text);
      onBytes(bytes);
      yield text;
    }
  }
  try {
    if (format === 'json') {
      yield* jsonDocuments(chunks());
      return;
    }
    let headers: string[] | undefined;
    let rowNumber = 0;
    for await (const row of csvRows(chunks())) {
      signal.throwIfAborted();
      rowNumber++;
      if (!headers) {
        if (row.some((header) => header.trim() === '') || new Set(row).size !== row.length) {
          throw new Error('CSV headers must be nonempty and unique.');
        }
        headers = row;
        continue;
      }
      if (row.length !== headers.length)
        throw new Error(
          `CSV row ${rowNumber} has ${row.length} cells; expected ${headers.length}.`
        );
      const document: Document = Object.create(null);
      const names = headers;
      row.forEach((cell, index) => {
        const trimmed = cell.trim();
        let value: unknown = cell;
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            value = BSON.EJSON.parse(trimmed, { relaxed: false });
          } catch {
            /* Ordinary text remains text. */
          }
        }
        document[names[index]] = value;
      });
      yield document;
    }
    if (!headers) throw new Error('CSV file has no header row.');
  } finally {
    stream.destroy();
  }
}
