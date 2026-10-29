import * as monaco from 'monaco-editor';
import '../../../../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { QUERY_METHODS } from './shell-query';
import { bracketDepth, isBareMethodPosition, methodWordStart, stageSnippet } from './completion';
import { getAccentPalette } from './appearance';
import type { AccentSetting } from '../../../shared/types';

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
let currentAccent: AccentSetting = 'blue';

function wordRange(model: monaco.editor.ITextModel, position: monaco.Position): monaco.IRange {
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
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/']
    },
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
      const beforeCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });
      const bareMethodPosition = isBareMethodPosition(line, bracketDepth(beforeCursor));
      if (inMethodPosition || bareMethodPosition) {
        const methodRange: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: methodWordStart(line, position.column),
          endColumn: position.column
        };
        const methodSuggestions: monaco.languages.CompletionItem[] = QUERY_METHODS.map(
          (method) => ({
            label: method,
            kind: monaco.languages.CompletionItemKind.Method,
            detail: 'Query method',
            insertText: `${method}($0)`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `0_${method}`,
            range: methodRange
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
          insertText: stageSnippet(stage),
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
          sortText: `1_${operator}`,
          range
        });
      }

      suggestions.push({
        label: 'ObjectId',
        kind: monaco.languages.CompletionItemKind.Class,
        detail: 'BSON ObjectId',
        insertText: 'ObjectId("${1}")',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: '1_objectId',
        range
      });

      for (const path of completionFields) {
        suggestions.push({
          label: path,
          kind: monaco.languages.CompletionItemKind.Field,
          detail: 'Field',
          insertText: path,
          sortText: `2_${path}`,
          range
        });
      }

      return { suggestions };
    }
  });

  defineDinoDBThemes();
}

function defineDinoDBThemes(): void {
  const light = getAccentPalette(currentAccent, 'light');
  const dark = getAccentPalette(currentAccent, 'dark');

  monaco.editor.defineTheme('dinodb-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8E8E93' },
      { token: 'string', foreground: '18864B' },
      { token: 'number', foreground: 'C4600E' },
      { token: 'keyword', foreground: light.keyword.slice(1).toUpperCase() },
      { token: 'variable.name', foreground: '8250DF' },
      { token: 'identifier', foreground: '1D1D1F' },
      { token: 'bracket', foreground: '636366' },
      { token: 'delimiter', foreground: '636366' },
      { token: 'operator', foreground: '636366' }
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#1D1D1F',
      'editor.selectionBackground': `${light.accent}44`,
      'editor.inactiveSelectionBackground': `${light.accent}22`,
      'editor.lineHighlightBackground': '#00000008',
      'editorCursor.foreground': light.accent,
      'editorLineNumber.foreground': '#C7C7CC',
      'editorLineNumber.activeForeground': '#8E8E93',
      'editorIndentGuide.background1': '#00000014',
      'editorIndentGuide.activeBackground1': '#00000033',
      'editorWidget.foreground': '#1D1D1F',
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#0000001A',
      'editorWidget.resizeBorder': light.accent,
      'editorHoverWidget.background': '#FFFFFF',
      'editorHoverWidget.border': '#0000001A',
      'editorHoverWidget.statusBarBackground': '#F2F2F5',
      'editorHoverWidget.highlightForeground': light.keyword,
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.border': '#0000001A',
      'editorSuggestWidget.foreground': '#1D1D1F',
      'editorSuggestWidget.highlightForeground': light.accent,
      'editorSuggestWidget.focusHighlightForeground': light.keyword,
      'editorSuggestWidget.selectedBackground': `${light.accent}1F`,
      'editorSuggestWidget.selectedForeground': '#1D1D1F',
      'list.hoverBackground': '#0000000A',
      'list.hoverForeground': '#1D1D1F',
      'list.focusBackground': `${light.accent}14`,
      'list.focusForeground': '#1D1D1F',
      'list.focusOutline': `${light.accent}44`,
      'list.activeSelectionBackground': light.accent,
      'list.activeSelectionForeground': '#FFFFFF',
      'list.inactiveSelectionBackground': `${light.accent}22`,
      'list.highlightForeground': light.accent
    }
  });

  monaco.editor.defineTheme('dinodb-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '98989D' },
      { token: 'string', foreground: '30D158' },
      { token: 'number', foreground: 'FF9F0A' },
      { token: 'keyword', foreground: dark.keyword.slice(1).toUpperCase() },
      { token: 'variable.name', foreground: 'C9A8FF' },
      { token: 'identifier', foreground: 'F5F5F7' },
      { token: 'bracket', foreground: '98989D' },
      { token: 'delimiter', foreground: '98989D' },
      { token: 'operator', foreground: '98989D' }
    ],
    colors: {
      'editor.background': '#252528',
      'editor.foreground': '#F5F5F7',
      'editor.selectionBackground': `${dark.accent}48`,
      'editor.inactiveSelectionBackground': `${dark.accent}26`,
      'editor.lineHighlightBackground': '#FFFFFF08',
      'editorCursor.foreground': dark.accent,
      'editorLineNumber.foreground': '#48484A',
      'editorLineNumber.activeForeground': '#98989D',
      'editorIndentGuide.background1': '#FFFFFF0D',
      'editorIndentGuide.activeBackground1': '#FFFFFF26',
      'editorWidget.foreground': '#F5F5F7',
      'editorWidget.background': '#2C2C2E',
      'editorWidget.border': '#FFFFFF1A',
      'editorWidget.resizeBorder': dark.accent,
      'editorHoverWidget.background': '#2C2C2E',
      'editorHoverWidget.border': '#FFFFFF1A',
      'editorHoverWidget.statusBarBackground': '#3A3A3C',
      'editorHoverWidget.highlightForeground': dark.keyword,
      'editorSuggestWidget.background': '#2C2C2E',
      'editorSuggestWidget.border': '#FFFFFF1A',
      'editorSuggestWidget.foreground': '#F5F5F7',
      'editorSuggestWidget.highlightForeground': dark.accent,
      'editorSuggestWidget.focusHighlightForeground': dark.keyword,
      'editorSuggestWidget.selectedBackground': `${dark.accent}26`,
      'editorSuggestWidget.selectedForeground': '#F5F5F7',
      'list.hoverBackground': '#FFFFFF0F',
      'list.hoverForeground': '#F5F5F7',
      'list.focusBackground': `${dark.accent}26`,
      'list.focusForeground': '#F5F5F7',
      'list.focusOutline': `${dark.accent}55`,
      'list.activeSelectionBackground': dark.accent,
      'list.activeSelectionForeground': '#FFFFFF',
      'list.inactiveSelectionBackground': `${dark.accent}26`,
      'list.highlightForeground': dark.accent
    }
  });
}

init();

export function setCompletionFields(fields: string[]): void {
  completionFields = fields;
}

export function setMonacoAccent(accent: AccentSetting): void {
  if (accent === currentAccent) return;
  currentAccent = accent;
  defineDinoDBThemes();
  monaco.editor.setTheme(monacoDark ? 'dinodb-dark' : 'dinodb-light');
}

export function setMonacoTheme(dark: boolean): void {
  monacoDark = dark;
  monaco.editor.setTheme(dark ? 'dinodb-dark' : 'dinodb-light');
}

export function isMonacoDark(): boolean {
  return monacoDark;
}
