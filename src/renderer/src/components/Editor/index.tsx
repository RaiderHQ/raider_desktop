import { useMemo } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import { debounce } from 'lodash'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

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
      height="90vh"
      defaultLanguage={language}
      defaultValue={value || '// Start typing...'}
      onChange={handleEditorChange}
      theme="vs-light"
      options={{
        automaticLayout: true,
        scrollBeyondLastLine: false,
        minimap: { enabled: false }
      }}
    />
  )
}

export default MonacoEditor
