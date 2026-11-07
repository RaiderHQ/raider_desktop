import { useEffect, useRef, useCallback } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { registerRubyProviders, disposeRubyProviders } from './completions/registerProviders'
import useProjectStore from '@foundation/Stores/projectStore'

self.MonacoEnvironment = {
  getWorker(_, label): Worker {
    if (label === 'json') {
      return new jsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    return new editorWorker()
  }
}

interface EditorProps {
  value: string
  language: string
  onChange?: (value: string | undefined) => void
  revealLine?: number
}

const MonacoEditor = ({ value, language, onChange, revealLine }: EditorProps): JSX.Element => {
  loader.config({ monaco })
  const providersRegistered = useRef(false)
  const projectAutomation = useProjectStore((state) => state.projectAutomation)

  useEffect(() => {
    if (language === 'ruby' && !providersRegistered.current) {
      registerRubyProviders(monaco, projectAutomation)
      providersRegistered.current = true
    }

    return () => {
      if (providersRegistered.current) {
        disposeRubyProviders()
        providersRegistered.current = false
      }
    }
  }, [language, projectAutomation])

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)

  const reveal = useCallback((line?: number): void => {
    const editor = editorRef.current
    decorationsRef.current?.clear()
    decorationsRef.current = null
    if (!editor || !line) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
    decorationsRef.current = editor.createDecorationsCollection([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: 'raider-reveal-line' }
      }
    ])
  }, [])

  useEffect(() => {
    reveal(revealLine)
  }, [revealLine, reveal])

  const handleMount = (editor: monaco.editor.IStandaloneCodeEditor): void => {
    editorRef.current = editor
    reveal(revealLine)
  }

  // Not debounced: a Save or a leave right after the last keystroke must see that keystroke
  const handleEditorChange = (value: string | undefined): void => onChange?.(value)

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      defaultValue={value || '// Start typing...'}
      onChange={handleEditorChange}
      onMount={handleMount}
      theme="vs-light"
      options={{
        automaticLayout: true,
        scrollBeyondLastLine: false,
        minimap: { enabled: false },
        suggestOnTriggerCharacters: true,
        quickSuggestions: true
      }}
    />
  )
}

export default MonacoEditor
