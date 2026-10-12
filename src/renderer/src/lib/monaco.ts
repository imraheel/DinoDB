import * as monaco from 'monaco-editor';
import '../../../../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

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
    triggerCharacters: ['$', '"'],
    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.CompletionList {
      const range = wordRange(model, position);
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
}

init();

export function setCompletionFields(fields: string[]): void {
  completionFields = fields;
}

export function setMonacoTheme(dark: boolean): void {
  monacoDark = dark;
  monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
}

export function isMonacoDark(): boolean {
  return monacoDark;
}
