import React from 'react'
import CommandList from '@components/CommandList'
import type { CodeTestView } from '@shared/types/projectTest'

interface ReadOnlyTestViewProps {
  view: CodeTestView
  showCode: boolean
}

/** Every example of a hand-written spec, its steps under its name; nothing can be changed. */
const ReadOnlyTestView: React.FC<ReadOnlyTestViewProps> = ({ view, showCode }) => (
  <div className="h-full overflow-y-auto p-1 space-y-4">
    {view.examples.map((example, index) => (
      <section key={`${index}-${example.name}`}>
        <h4 className="px-1 pb-1 text-sm font-semibold text-neutral-dark">{example.name}</h4>
        <CommandList
          steps={example.steps}
          setSteps={() => {}}
          onDeleteStep={() => {}}
          showCode={showCode}
          readOnly
        />
      </section>
    ))}
  </div>
)

export default ReadOnlyTestView
