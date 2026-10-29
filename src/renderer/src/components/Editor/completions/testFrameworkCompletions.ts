import * as monaco from 'monaco-editor'

export function registerRspecCompletions(monacoInstance: typeof monaco): monaco.IDisposable {
  return monacoInstance.languages.registerCompletionItemProvider('ruby', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const suggestions: monaco.languages.CompletionItem[] = [
        {
          label: 'describe',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'describe "${1:subject}" do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'RSpec describe block',
          range
        },
        {
          label: 'context',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'context "${1:context}" do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'RSpec context block',
          range
        },
        {
          label: 'it',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'it "${1:does something}" do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'RSpec example',
          range
        },
        {
          label: 'before',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'before do\n  ${1}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Before hook',
          range
        },
        {
          label: 'after',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'after do\n  ${1}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'After hook',
          range
        },
        {
          label: 'let',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'let(:${1:name}) { ${2} }',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Lazy-evaluated variable',
          range
        },
        {
          label: 'let!',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'let!(:${1:name}) { ${2} }',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Eagerly-evaluated variable',
          range
        },
        {
          label: 'subject',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'subject { ${1} }',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Define subject',
          range
        },
        {
          label: 'expect',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'expect(${1:actual}).to ${2:matcher}',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'RSpec expectation',
          range
        },
        {
          label: 'eq',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'eq(${1:expected})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Equality matcher',
          range
        },
        {
          label: 'be_truthy',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'be_truthy',
          documentation: 'Truthy matcher',
          range
        },
        {
          label: 'be_falsey',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'be_falsey',
          documentation: 'Falsey matcher',
          range
        },
        {
          label: 'be_nil',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'be_nil',
          documentation: 'Nil matcher',
          range
        },
        {
          label: 'include',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'include(${1:expected})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Include matcher',
          range
        },
        {
          label: 'be_empty',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'be_empty',
          documentation: 'Empty matcher',
          range
        },
        {
          label: 'raise_error',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'raise_error(${1:ErrorClass})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Raise error matcher',
          range
        },
        {
          label: 'be_displayed',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'be_displayed',
          documentation: 'Element displayed matcher',
          range
        },
        {
          label: 'be_enabled',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'be_enabled',
          documentation: 'Element enabled matcher',
          range
        },
        {
          label: 'shared_examples',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'shared_examples "${1:name}" do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Shared examples',
          range
        },
        {
          label: 'it_behaves_like',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'it_behaves_like "${1:shared example}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Include shared examples',
          range
        }
      ]

      return { suggestions }
    }
  })
}

export function registerCucumberCompletions(monacoInstance: typeof monaco): monaco.IDisposable {
  return monacoInstance.languages.registerCompletionItemProvider('ruby', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const suggestions: monaco.languages.CompletionItem[] = [
        {
          label: 'Given',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'Given("${1:step}") do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Given step definition',
          range
        },
        {
          label: 'When',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'When("${1:step}") do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'When step definition',
          range
        },
        {
          label: 'Then',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'Then("${1:step}") do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Then step definition',
          range
        },
        {
          label: 'And',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'And("${1:step}") do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'And step definition',
          range
        },
        {
          label: 'Before',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'Before do\n  ${1}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Before hook',
          range
        },
        {
          label: 'After',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'After do\n  ${1}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'After hook',
          range
        },
        {
          label: 'World',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'World(${1:ModuleName})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Include module in World',
          range
        }
      ]

      return { suggestions }
    }
  })
}
