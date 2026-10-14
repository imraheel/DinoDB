import * as monaco from 'monaco-editor';
import '../../../../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { QUERY_METHODS } from './shell-query';

const STAGES: string[] = [
  '$match',
  '$project',
  '$group',
  '$sort',
  '$limit',
  '$skip',
  '$unwind',
  '$lookup',
  '$addFields',
  '$count',
  '$facet',
  '$replaceRoot',
  '$sample',
  '$set',
  '$unset',
  '$out',
  '$merge'
];

const OPERATORS: string[] = [
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$and',
  '$or',
  '$not',
  '$exists',
  '$regex',
  '$sum',
  '$avg',
  '$min',
  '$max',
  '$push',
  '$addToSet',
  '$first',
  '$last',
  '$literal',
  '$cond',
  '$ifNull',
  '$toString',
  '$toLower',
  '$toUpper',
  '$dateAdd',
  '$dateDiff'
];

let initialized = false;
let completionFields: string[] = [];
let monacoDark = false;

function wordRange(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn
  };
}

function init(): void {
  if (initialized) return;
  initialized = true;

  if (typeof self !== 'undefined' && !(self as { MonacoEnvironment?: unknown }).MonacoEnvironment) {
    (self as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
      getWorker: () => new EditorWorker()
    };
  }

  monaco.languages.register({ id: 'mongodb' });

  monaco.languages.setLanguageConfiguration('mongodb', {
    wordPattern: /[A-Za-z0-9_$.]+/,
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ]
  });

  monaco.languages.setMonarchTokensProvider('mongodb', {
    defaultToken: '',
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, { token: 'comment', next: '@blockComment' }],
        [/"(?:[^"\\]|\\.)*"/, 'string'],
        [/'(?:[^'\\]|\\.)*'/, 'string'],
        [/`(?:[^`\\]|\\.)*`/, 'string'],
        [/\$[A-Za-z_][\w$]*/, 'keyword'],
        [/\b(?:true|false|null)\b/, 'keyword'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/[A-Za-z_][\w$]*(?=\s*:)/, 'variable.name'],
        [/[A-Za-z_$][\w$]*/, 'identifier'],
        [/[{}[\]()]/, 'bracket'],
        [/[.,:;]/, 'delimiter'],
        [/[=+\-*/%<>!&|^~?]+/, 'operator']
      ],
      blockComment: [
        [/\*\//, { token: 'comment', next: '@pop' }],
        [/./, 'comment']
      ]
    }
  });

  monaco.languages.registerCompletionItemProvider('mongodb', {
    triggerCharacters: ['$', '"', '.'],
    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.CompletionList {
      const range = wordRange(model, position);
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });
      const inMethodPosition =
        /(?:^|[^A-Za-z0-9_$])(?:db|getCollection\s*\([^)]*\))(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*[A-Za-z_$\w]*$/.test(
          line
        );
      if (inMethodPosition) {
        const methodSuggestions: monaco.languages.CompletionItem[] = QUERY_METHODS.map(
          (method) => ({
            label: method,
            kind: monaco.languages.CompletionItemKind.Method,
            detail: 'Query method',
            insertText: `${method}($0)`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `0_${method}`,
            range
          })
        );
        return { suggestions: methodSuggestions };
      }

      const suggestions: monaco.languages.CompletionItem[] = [];

      for (const stage of STAGES) {
        suggestions.push({
          label: stage,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: 'Aggregation stage',
          insertText: `"${stage}": {\n\t\${1}\n}`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `0_${stage}`,
          range
        });
      }

      for (const operator of OPERATORS) {
        suggestions.push({
          label: operator,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: 'Operator',
          insertText: operator,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `1_${operator}`,
          range
        });
      }

      for (const path of completionFields) {
        suggestions.push({
          label: path,
          kind: monaco.languages.CompletionItemKind.Field,
          detail: 'Field',
          insertText: path,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `2_${path}`,
          range
        });
      }

      return { suggestions };
    }
  });

  monaco.editor.defineTheme('nexdb-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8E8E93' },
      { token: 'string', foreground: '18864B' },
      { token: 'number', foreground: 'C4600E' },
      { token: 'keyword', foreground: '0055B3' },
      { token: 'variable.name', foreground: '8250DF' },
      { token: 'identifier', foreground: '1D1D1F' },
      { token: 'bracket', foreground: '636366' },
      { token: 'delimiter', foreground: '636366' },
      { token: 'operator', foreground: '636366' }
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#1D1D1F',
      'editor.selectionBackground': '#007AFF44',
      'editor.inactiveSelectionBackground': '#007AFF22',
      'editor.lineHighlightBackground': '#00000008',
      'editorCursor.foreground': '#007AFF',
      'editorLineNumber.foreground': '#C7C7CC',
      'editorLineNumber.activeForeground': '#8E8E93',
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#0000001A',
      'editorSuggestWidget.selectedBackground': '#007AFF1F'
    }
  });

  monaco.editor.defineTheme('nexdb-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '98989D' },
      { token: 'string', foreground: '30D158' },
      { token: 'number', foreground: 'FF9F0A' },
      { token: 'keyword', foreground: '6BD0FF' },
      { token: 'variable.name', foreground: 'C9A8FF' },
      { token: 'identifier', foreground: 'F5F5F7' },
      { token: 'bracket', foreground: '98989D' },
      { token: 'delimiter', foreground: '98989D' },
      { token: 'operator', foreground: '98989D' }
    ],
    colors: {
      'editor.background': '#252528',
      'editor.foreground': '#F5F5F7',
      'editor.selectionBackground': '#0A84FF48',
      'editor.inactiveSelectionBackground': '#0A84FF26',
      'editor.lineHighlightBackground': '#FFFFFF08',
      'editorCursor.foreground': '#0A84FF',
      'editorLineNumber.foreground': '#48484A',
      'editorLineNumber.activeForeground': '#98989D',
      'editorWidget.background': '#2C2C2E',
      'editorWidget.border': '#FFFFFF1A',
      'editorSuggestWidget.selectedBackground': '#0A84FF26'
    }
  });
}

init();

export function setCompletionFields(fields: string[]): void {
  completionFields = fields;
}

export function setMonacoTheme(dark: boolean): void {
  monacoDark = dark;
  monaco.editor.setTheme(dark ? 'nexdb-dark' : 'nexdb-light');
}

export function isMonacoDark(): boolean {
  return monacoDark;
}
