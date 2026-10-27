import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BSON } from 'mongodb';
import { csvCell, csvRows, jsonDocuments, jsonText, readDocuments } from './transfer-codecs';

async function* chunks(text: string, size = 1) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}
async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of items) values.push(value);
  return values;
}
const directories: string[] = [];
async function file(content: string | Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), 'nexdb-codec-'));
  directories.push(dir);
  const path = join(dir, 'data');
  await writeFile(path, content);
  return path;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('streaming JSON', () => {
  it('reads arrays, escaped strings and NDJSON across one-character chunks', async () => {
    const doc = { text: 'quote " slash \\ braces {} []', nested: { values: [1, 2] } };
    const parsed = await collect(jsonDocuments(chunks(`[${JSON.stringify(doc)},{}]`)));
    expect(JSON.parse(jsonText(parsed[0]))).toMatchObject({ text: doc.text });
    expect(parsed).toHaveLength(2);
    expect(await collect(jsonDocuments(chunks('\uFEFF{}\n{}\r\n')))).toEqual([{}, {}]);
    expect(await collect(jsonDocuments(chunks('[]')))).toEqual([]);
  });
  it.each(['', '[{}', '[{},]', '[{}{}]', '{}{}', '[1]', '{"broken":}', '[]{}', '{"a":[]'])(
    'rejects malformed JSON %j',
    async (text) => {
      await expect(collect(jsonDocuments(chunks(text)))).rejects.toThrow();
    }
  );
  it('round-trips canonical BSON types through JSON', async () => {
    const doc = {
      _id: new BSON.ObjectId(),
      long: BSON.Long.fromString('9007199254740993'),
      date: new Date(),
      decimal: BSON.Decimal128.fromString('1.25'),
      binary: new BSON.Binary(Buffer.from([1, 2])),
      int: new BSON.Int32(42),
      double: new BSON.Double(1.5)
    };
    const [result] = await collect(jsonDocuments(chunks(jsonText(doc), 7)));
    expect(jsonText(result)).toBe(jsonText(doc));
  });
});

describe('streaming CSV', () => {
  it('handles BOM, escaped quotes, multiline fields and split CRLF', async () => {
    const rows = await collect(csvRows(chunks('\uFEFFa,b\r\n"line\nnext","a""b"\r\nlast,\r\n')));
    expect(rows).toEqual([
      ['a', 'b'],
      ['line\nnext', 'a"b'],
      ['last', '']
    ]);
    expect(csvCell('a,"b\n')).toBe('"a,""b\n"');
  });
  it.each(['a\n"broken', 'a\n"closed"extra', 'a\nno"quote'])(
    'rejects malformed quoting %j',
    async (text) => {
      await expect(collect(csvRows(chunks(text)))).rejects.toThrow();
    }
  );
  it('preserves ordinary strings and decodes structured Extended JSON cells', async () => {
    const path = await file(
      'id,empty,nested,oid\n001,,"{""a"":1}","{""$oid"":""507f1f77bcf86cd799439011""}"\n'
    );
    const [doc] = await collect(readDocuments(path, 'csv', () => {}, new AbortController().signal));
    expect(doc.id).toBe('001');
    expect(doc.empty).toBe('');
    expect(doc.oid).toBeInstanceOf(BSON.ObjectId);
    expect(doc.nested.a.valueOf()).toBe(1);
  });
  it.each(['a,a\n1,2', ',b\n1,2', 'a,b\n1', ''])(
    'rejects invalid headers/row widths %j',
    async (text) => {
      const path = await file(text);
      await expect(
        collect(readDocuments(path, 'csv', () => {}, new AbortController().signal))
      ).rejects.toThrow();
    }
  );
});

describe('BSON files', () => {
  it('reads concatenated BSON documents and reports bytes', async () => {
    const docs = [
      { _id: new BSON.ObjectId(), n: BSON.Long.fromString('9007199254740993') },
      { empty: [] }
    ];
    const bytes = Buffer.concat(docs.map((doc) => BSON.serialize(doc)));
    const path = await file(bytes);
    let read = 0;
    const result = await collect(
      readDocuments(
        path,
        'bson',
        (value) => {
          read = value;
        },
        new AbortController().signal
      )
    );
    expect(result.map(jsonText)).toEqual(docs.map(jsonText));
    expect(read).toBe(bytes.length);
  });
  it.each([Buffer.from([1]), Buffer.from([4, 0, 0, 0]), Buffer.from([10, 0, 0, 0, 0])])(
    'rejects truncated or invalid BSON',
    async (bytes) => {
      const path = await file(bytes);
      await expect(
        collect(readDocuments(path, 'bson', () => {}, new AbortController().signal))
      ).rejects.toThrow();
    }
  );
  it('accepts an empty BSON collection and honours cancellation', async () => {
    const path = await file(Buffer.alloc(0));
    expect(
      await collect(readDocuments(path, 'bson', () => {}, new AbortController().signal))
    ).toEqual([]);
    const abort = new AbortController();
    abort.abort();
    await expect(collect(readDocuments(path, 'bson', () => {}, abort.signal))).rejects.toThrow();
  });
});

it('rejects Extended JSON scalar wrappers at the document root', async () => {
  await expect(
    collect(jsonDocuments(chunks('{"$oid":"507f1f77bcf86cd799439011"}')))
  ).rejects.toThrow('Expected a document object');
});
