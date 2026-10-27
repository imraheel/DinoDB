import { expect, it } from 'vitest';
import { ToolLogDecoder, matchingNamespace } from './database-tool-progress';
it('decodes chunk-split UTF-8, CRLF and final unterminated lines', () => {
  const lines: string[] = [];
  const parser = new ToolLogDecoder((line) => lines.push(line));
  const bytes = Buffer.from('metadata for source.café\r\nnext\rfinal');
  for (const byte of bytes) parser.write(Buffer.from([byte]));
  parser.finish();
  expect(lines).toEqual(['metadata for source.café', 'next', 'final']);
});
it('bounds unfinished log lines and recognises only positively scoped namespaces', () => {
  const lines: string[] = [];
  const parser = new ToolLogDecoder((line) => lines.push(line));
  parser.write(Buffer.from('a'.repeat(70000)));
  parser.finish();
  expect(lines).toEqual(['[Oversized tool output omitted]']);
  expect(matchingNamespace('reading metadata for source.users from dump', 'source')).toBe(
    'source.users'
  );
  expect(matchingNamespace('found collection source.empty bson', 'source')).toBe('source.empty');
  expect(matchingNamespace('reading metadata for other.users', 'source')).toBeUndefined();
  expect(matchingNamespace('an arbitrary source.users string', 'source')).toBeUndefined();
});
it('recognises quoted namespaces emitted by current Database Tools', () => {
  expect(
    matchingNamespace('found collection `source.users` bson to restore to `target.users`', 'source')
  ).toBe('source.users');
  expect(
    matchingNamespace(
      'found collection metadata from "source.empty" to restore to "target.empty"',
      'source'
    )
  ).toBe('source.empty');
});
it('discards the entire remainder of an oversized line before accepting more output', () => {
  const lines: string[] = [];
  const parser = new ToolLogDecoder((line) => lines.push(line));
  parser.write(Buffer.from('x'.repeat(70000)));
  parser.write(Buffer.from('sensitive-tail\nnormal\n'));
  parser.finish();
  expect(lines).toEqual(['[Oversized tool output omitted]', 'normal']);
  expect(
    matchingNamespace('skipping restoring `source.users`, it is not included', 'source')
  ).toBeUndefined();
});
