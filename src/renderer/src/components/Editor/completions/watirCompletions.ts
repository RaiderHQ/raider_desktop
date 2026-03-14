import * as monaco from 'monaco-editor'

export function registerWatirCompletions(monacoInstance: typeof monaco): monaco.IDisposable {
  return monacoInstance.languages.registerCompletionItemProvider('ruby', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      const elementTypes = [
        'text_field',
        'button',
        'link',
        'div',
        'span',
        'select_list',
        'checkbox',
        'radio',
        'textarea',
        'table',
        'tr',
        'td',
        'form',
        'input',
        'img',
        'h1',
        'h2',
        'h3',
        'li',
        'ul',
        'label',
        'element'
      ]

      const suggestions: monaco.languages.CompletionItem[] = [
        {
          label: 'Watir::Browser.new',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'Watir::Browser.new :${1|chrome,firefox,safari,edge|}',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create new browser instance',
          range
        },
        {
          label: 'goto',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'goto("${1:url}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Navigate to URL',
          range
        },
        ...elementTypes.map((el) => ({
          label: el,
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: `${el}(id: "\${1:locator}")`,
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: `Find ${el.replace('_', ' ')} element`,
          range
        })),
        {
          label: 'click',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'click',
          documentation: 'Click element',
          range
        },
        {
          label: 'set',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'set("${1:value}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Set element value',
          range
        },
        {
          label: 'value',
          kind: monacoInstance.languages.CompletionItemKind.Property,
          insertText: 'value',
          documentation: 'Get element value',
          range
        },
        {
          label: 'text',
          kind: monacoInstance.languages.CompletionItemKind.Property,
          insertText: 'text',
          documentation: 'Get element text',
          range
        },
        {
          label: 'present?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'present?',
          documentation: 'Check if element is present',
          range
        },
        {
          label: 'visible?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'visible?',
          documentation: 'Check if element is visible',
          range
        },
        {
          label: 'enabled?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'enabled?',
          documentation: 'Check if element is enabled',
          range
        },
        {
          label: 'exists?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'exists?',
          documentation: 'Check if element exists',
          range
        },
        {
          label: 'wait_until',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'wait_until(timeout: ${1:10}, &:${2:present?})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Wait until condition',
          range
        },
        {
          label: 'close',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'close',
          documentation: 'Close browser',
          range
        },
        {
          label: 'url',
          kind: monacoInstance.languages.CompletionItemKind.Property,
          insertText: 'url',
          documentation: 'Get current URL',
          range
        },
        {
          label: 'title',
          kind: monacoInstance.languages.CompletionItemKind.Property,
          insertText: 'title',
          documentation: 'Get page title',
          range
        },
        {
          label: 'back',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'back',
          documentation: 'Navigate back',
          range
        },
        {
          label: 'forward',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'forward',
          documentation: 'Navigate forward',
          range
        },
        {
          label: 'refresh',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'refresh',
          documentation: 'Refresh page',
          range
        },
        {
          label: 'execute_script',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'execute_script("${1:script}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Execute JavaScript',
          range
        },
        {
          label: 'select (dropdown)',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'select("${1:value}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Select option from dropdown',
          range
        }
      ]

      return { suggestions }
    }
  })
}
