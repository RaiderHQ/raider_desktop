import { useMemo, useEffect, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import { debounce } from 'lodash'
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
}

const MonacoEditor = ({ value, language, onChange }: EditorProps): JSX.Element => {
  loader.config({ monaco })
  const providersRegistered = useRef(false)
  const projectAutomation = useProjectStore((state) => state.projectAutomation)
  const projectFramework = useProjectStore((state) => state.projectFramework)

  useEffect(() => {
    if (language === 'ruby' && !providersRegistered.current) {
      registerRubyProviders(monaco, projectAutomation, projectFramework)
      providersRegistered.current = true
    }

    return () => {
      if (providersRegistered.current) {
        disposeRubyProviders()
        providersRegistered.current = false
      }
    }
  }, [language, projectAutomation, projectFramework])

  const debouncedOnChange = useMemo(() => {
    if (!onChange) return undefined

    return debounce((value: string | undefined) => {
      onChange(value)
    }, 300)
  }, [onChange])

  const handleEditorChange = (value: string | undefined): void => {
    if (!debouncedOnChange) {
      return
    }

    debouncedOnChange(value)
  }

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      defaultValue={value || '// Start typing...'}
      onChange={handleEditorChange}
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
