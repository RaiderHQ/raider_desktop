import * as monaco from 'monaco-editor'

export function registerSeleniumCompletions(monacoInstance: typeof monaco): monaco.IDisposable {
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
          label: 'find_element',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText:
            'find_element(:${1|id,css,xpath,name,class,link_text,partial_link_text,tag_name|}, ${2:"value"})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Find a single element',
          range
        },
        {
          label: 'find_elements',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText:
            'find_elements(:${1|id,css,xpath,name,class,link_text,partial_link_text,tag_name|}, ${2:"value"})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Find multiple elements',
          range
        },
        {
          label: 'navigate.to',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'navigate.to("${1:url}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Navigate to a URL',
          range
        },
        {
          label: 'get',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'get("${1:url}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Load a URL',
          range
        },
        {
          label: 'click',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'click',
          documentation: 'Click element',
          range
        },
        {
          label: 'send_keys',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'send_keys("${1:text}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Type text into element',
          range
        },
        {
          label: 'clear',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'clear',
          documentation: 'Clear element text',
          range
        },
        {
          label: 'submit',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'submit',
          documentation: 'Submit form',
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
          label: 'displayed?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'displayed?',
          documentation: 'Check if element is displayed',
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
          label: 'selected?',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'selected?',
          documentation: 'Check if element is selected',
          range
        },
        {
          label: 'attribute',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'attribute("${1:name}")',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Get element attribute',
          range
        },
        {
          label: 'Selenium::WebDriver::Wait',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'Selenium::WebDriver::Wait.new(timeout: ${1:10}).until { ${2} }',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Explicit wait',
          range
        },
        {
          label: 'Selenium::WebDriver.for',
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: 'Selenium::WebDriver.for :${1|chrome,firefox,safari,edge|}',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create WebDriver instance',
          range
        },
        {
          label: 'navigate.back',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'navigate.back',
          documentation: 'Go back',
          range
        },
        {
          label: 'navigate.forward',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'navigate.forward',
          documentation: 'Go forward',
          range
        },
        {
          label: 'navigate.refresh',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'navigate.refresh',
          documentation: 'Refresh page',
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
          label: 'current_url',
          kind: monacoInstance.languages.CompletionItemKind.Property,
          insertText: 'current_url',
          documentation: 'Get current URL',
          range
        },
        {
          label: 'page_source',
          kind: monacoInstance.languages.CompletionItemKind.Property,
          insertText: 'page_source',
          documentation: 'Get page source',
          range
        },
        {
          label: 'switch_to.frame',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'switch_to.frame(${1:element})',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Switch to iframe',
          range
        },
        {
          label: 'switch_to.default_content',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'switch_to.default_content',
          documentation: 'Switch to main content',
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
          label: 'manage.window.maximize',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'manage.window.maximize',
          documentation: 'Maximize window',
          range
        },
        {
          label: 'manage.timeouts.implicit_wait=',
          kind: monacoInstance.languages.CompletionItemKind.Method,
          insertText: 'manage.timeouts.implicit_wait = ${1:10}',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Set implicit wait',
          range
        }
      ]

      return { suggestions }
    }
  })
}
