/**
 * Pure helpers for the Monaco `mongodb` completion provider.
 * Kept free of monaco-editor imports so they can be unit-tested.
 */

/** Bracket depth at the end of `text` (content before the cursor); strings and comments ignored. */
export function bracketDepth(text: string): number {
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === ch) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i = Math.min(i + 2, text.length);
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    i += 1;
  }
  return depth;
}

/** 1-based start column of the method word at the cursor (stops at dots and other non-word chars). */
export function methodWordStart(line: string, column: number): number {
  let col = column;
  while (col > 1 && /[A-Za-z0-9_$]/.test(line[col - 2] ?? '')) col -= 1;
  return col;
}

/** True when the cursor is typing a bare identifier at statement level (e.g. `countDoc`). */
export function isBareMethodPosition(line: string, depth: number): boolean {
  return depth === 0 && /(?:^|[\s;])[A-Za-z_$][\w$]*$/.test(line);
}

/**
 * Insert text for an aggregation stage suggestion. The `$` of the stage name is
 * escaped (`\$`) so Monaco's snippet parser inserts it literally instead of
 * treating `$match` as an unresolved snippet variable (which renders as '').
 * `${1}` stays a snippet placeholder so the cursor lands inside the stage body.
 */
export function stageSnippet(stage: string): string {
  return `"\\${stage}": {\n\t\${1}\n}`;
}
