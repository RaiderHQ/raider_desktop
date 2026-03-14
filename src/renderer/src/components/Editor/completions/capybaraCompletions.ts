import * as monaco from 'monaco-editor'

export function registerCapybaraCompletions(monacoInstance: typeof monaco): monaco.IDisposable {
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
          label: 'visit',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'visit "${1:path}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Visit a URL or path',
          range
        },
        {
          label: 'find',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'find("${1:selector}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Find element by CSS selector',
          range
        },
        {
          label: 'find_field',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'find_field("${1:locator}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Find form field',
          range
        },
        {
          label: 'find_button',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'find_button("${1:locator}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Find button',
          range
        },
        {
          label: 'find_link',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'find_link("${1:locator}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Find link',
          range
        },
        {
          label: 'all',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'all("${1:selector}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Find all matching elements',
          range
        },
        {
          label: 'click_on',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'click_on "${1:locator}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Click on a link, button, or label',
          range
        },
        {
          label: 'click_link',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'click_link "${1:locator}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Click a link',
          range
        },
        {
          label: 'click_button',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'click_button "${1:locator}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Click a button',
          range
        },
        {
          label: 'fill_in',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'fill_in "${1:locator}", with: "${2:value}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Fill in a text field',
          range
        },
        {
          label: 'select',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'select "${1:value}", from: "${2:locator}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Select an option from a dropdown',
          range
        },
        {
          label: 'check',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'check "${1:locator}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Check a checkbox',
          range
        },
        {
          label: 'uncheck',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'uncheck "${1:locator}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Uncheck a checkbox',
          range
        },
        {
          label: 'choose',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'choose "${1:locator}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Choose a radio button',
          range
        },
        {
          label: 'attach_file',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'attach_file "${1:locator}", "${2:path}"',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Attach a file to a file input',
          range
        },
        {
          label: 'have_content',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_content("${1:text}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert page has content',
          range
        },
        {
          label: 'have_selector',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_selector("${1:selector}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert page has matching selector',
          range
        },
        {
          label: 'have_css',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_css("${1:selector}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert page has CSS selector',
          range
        },
        {
          label: 'have_xpath',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_xpath("${1:xpath}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert page has XPath',
          range
        },
        {
          label: 'have_field',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_field("${1:locator}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert page has form field',
          range
        },
        {
          label: 'have_link',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_link("${1:locator}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert page has link',
          range
        },
        {
          label: 'have_button',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_button("${1:locator}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert page has button',
          range
        },
        {
          label: 'have_current_path',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'have_current_path("${1:path}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Assert current path',
          range
        },
        {
          label: 'within',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'within("${1:selector}") do\n  ${2}\nend',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Scope actions within an element',
          range
        },
        {
          label: 'current_path',
          kind: monacoInstance.languages.CompletionItemKind.Property,
          insertText: 'current_path',
          documentation: 'Get current path',
          range
        },
        {
          label: 'has_content?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'has_content?("${1:text}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Check if page has content',
          range
        },
        {
          label: 'has_selector?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'has_selector?("${1:selector}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Check if page has selector',
          range
        }
      ]

      return { suggestions }
    }
  })
}
