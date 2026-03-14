import * as monaco from 'monaco-editor'

export function registerRubyCompletions(monacoInstance: typeof monaco): monaco.IDisposable {
  return monacoInstance.languages.registerCompletionItemProvider('ruby', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const keywords = [
        'def',
        'end',
        'class',
        'module',
        'if',
        'elsif',
        'else',
        'unless',
        'case',
        'when',
        'while',
        'until',
        'for',
        'do',
        'begin',
        'rescue',
        'ensure',
        'raise',
        'return',
        'yield',
        'block_given?',
        'require',
        'require_relative',
        'include',
        'extend',
        'attr_reader',
        'attr_writer',
        'attr_accessor',
        'private',
        'protected',
        'public',
        'self',
        'super',
        'nil',
        'true',
        'false',
        'puts',
        'print',
        'p'
      ]

      const suggestions: monaco.languages.CompletionItem[] = [
        ...keywords.map((keyword) => ({
          label: keyword,
          kind: monacoInstance.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range
        })),
        {
          label: 'def method',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'def ${1:method_name}\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Define a method',
          range
        },
        {
          label: 'class definition',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'class ${1:ClassName}\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Define a class',
          range
        },
        {
          label: 'module definition',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'module ${1:ModuleName}\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Define a module',
          range
        },
        {
          label: 'each block',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'each do |${1:item}|\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Iterate with each',
          range
        },
        {
          label: 'map block',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'map { |${1:item}| ${2} }',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Transform with map',
          range
        },
        {
          label: 'initialize',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'def initialize(${1:args})\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Constructor method',
          range
        },
        {
          label: 'begin rescue',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'begin\n  ${1}\nrescue ${2:StandardError} => e\n  ${3}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Error handling block',
          range
        }
      ]

      return { suggestions }
    }
  })
}
