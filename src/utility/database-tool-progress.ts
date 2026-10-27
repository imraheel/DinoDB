import { StringDecoder } from 'node:string_decoder';

export class ToolLogDecoder {
  private readonly decoder = new StringDecoder('utf8');
  private pending = '';
  private discarding = false;
  constructor(private readonly line: (text: string) => void) {}
  write(chunk: Buffer): void {
    this.consume(this.decoder.write(chunk));
  }
  private consume(text: string) {
    if (this.discarding) {
      const newline = text.search(/[\r\n]/);
      if (newline === -1) return;
      this.discarding = false;
      text = text.slice(newline + 1);
    }
    this.pending += text;
    let end: number;
    while ((end = this.pending.search(/[\r\n]/)) !== -1) {
      const line = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 1);
      if (line)
        this.line(Buffer.byteLength(line) > 65536 ? '[Oversized tool output omitted]' : line);
    }
    if (Buffer.byteLength(this.pending) > 65536) {
      this.line('[Oversized tool output omitted]');
      this.pending = '';
      this.discarding = true;
    }
  }
  finish(): void {
    this.consume(this.decoder.end());
    if (this.pending) this.line(this.pending);
    this.pending = '';
  }
}
export function matchingNamespace(line: string, database: string): string | undefined {
  // Version-checked tool output: metadata/restore/namespace messages only.
  const prefix = database.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/skipping|not included|not restoring/i.test(line)) return undefined;
  if (!/metadata|restor|found collection|namespace|would/i.test(line)) return undefined;
  return line.match(
    new RegExp(`(?:^|[\\s"'\\x60])(${prefix}\\.[^\\s"'\\x60]+?)(?=[\\s"'\\x60]|$)`)
  )?.[1];
}
