import { render, screen, fireEvent, act } from '@testing-library/react'
import CommandBlock from '@components/CommandBlock'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vals?: Record<string, string>) =>
      vals ? `${key} ${JSON.stringify(vals)}` : key
  })
}))

const mockApi = {
  commandParser: vi.fn().mockResolvedValue('Visited https://example.com'),
  xpathParser: vi.fn().mockResolvedValue('Clicked xpath element')
}

beforeEach(() => {
  window.api = mockApi as any
  vi.clearAllMocks()
})

const baseProps = {
  index: 0,
  showCode: false,
  onDragStart: vi.fn(),
  onDragEnter: vi.fn(),
  onDragEnd: vi.fn(),
  onDelete: vi.fn()
}

describe('CommandBlock', () => {
  it('shows code view when showCode=true', async () => {
    await act(async () => {
      render(
        <CommandBlock
          {...baseProps}
          command='@driver.get("https://example.com")'
          showCode={true}
        />
      )
    })
    expect(screen.getByText('@driver.get("https://example.com")')).toBeInTheDocument()
  })

  it('shows friendly view loading state then result when showCode=false', async () => {
    await act(async () => {
      render(
        <CommandBlock
          {...baseProps}
          command='@driver.get("https://example.com")'
          showCode={false}
        />
      )
    })
    expect(await screen.findByText('Visited https://example.com')).toBeInTheDocument()
    expect(mockApi.commandParser).toHaveBeenCalledWith('@driver.get("https://example.com")')
  })

  it('uses xpathParser for xpath commands', async () => {
    await act(async () => {
      render(
        <CommandBlock
          {...baseProps}
          command="@driver.find_element(:xpath, '//div').click"
          showCode={false}
        />
      )
    })
    expect(mockApi.xpathParser).toHaveBeenCalled()
  })

  it('calls onDelete with the correct index when delete button is clicked', async () => {
    const onDelete = vi.fn()
    await act(async () => {
      render(
        <CommandBlock {...baseProps} command="step" showCode={true} onDelete={onDelete} index={2} />
      )
    })
    fireEvent.click(screen.getByLabelText('Delete step'))
    expect(onDelete).toHaveBeenCalledWith(2)
  })

  it('shows a comment in code view when the command contains " # "', async () => {
    await act(async () => {
      render(
        <CommandBlock {...baseProps} command='@driver.get("url") # navigate' showCode={true} />
      )
    })
    expect(screen.getByText(/navigate/)).toBeInTheDocument()
  })

  describe('Editable code view', () => {
    it('enters edit mode on double-click in code view', async () => {
      const onEdit = vi.fn()
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("https://example.com")'
            showCode={true}
            onEdit={onEdit}
          />
        )
      })

      const codeElement = screen.getByText('@driver.get("https://example.com")')
      fireEvent.doubleClick(codeElement.closest('.cursor-text')!)

      expect(screen.getByLabelText('Edit command')).toBeInTheDocument()
    })

    it('does not enter edit mode when onEdit is not provided', async () => {
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("https://example.com")'
            showCode={true}
          />
        )
      })

      const codeElement = screen.getByText('@driver.get("https://example.com")')
      fireEvent.doubleClick(codeElement.closest('div')!)

      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
    })

    it('does not enter edit mode in friendly view', async () => {
      const onEdit = vi.fn()
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("https://example.com")'
            showCode={false}
            onEdit={onEdit}
          />
        )
      })

      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
    })

    it('saves edit on Enter key', async () => {
      const onEdit = vi.fn()
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("old")'
            showCode={true}
            onEdit={onEdit}
            index={3}
          />
        )
      })

      const codeElement = screen.getByText('@driver.get("old")')
      fireEvent.doubleClick(codeElement.closest('.cursor-text')!)

      const textarea = screen.getByLabelText('Edit command')
      fireEvent.change(textarea, { target: { value: '@driver.get("new")' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(onEdit).toHaveBeenCalledWith(3, '@driver.get("new")')
    })

    it('cancels edit on Escape key', async () => {
      const onEdit = vi.fn()
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("original")'
            showCode={true}
            onEdit={onEdit}
          />
        )
      })

      const codeElement = screen.getByText('@driver.get("original")')
      await act(async () => {
        fireEvent.doubleClick(codeElement.closest('.cursor-text')!)
      })

      const textarea = screen.getByLabelText('Edit command')
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'changed' } })
      })
      await act(async () => {
        fireEvent.keyDown(textarea, { key: 'Escape' })
      })

      expect(onEdit).not.toHaveBeenCalled()
      // Should be back to code view (not editing)
      expect(screen.queryByLabelText('Edit command')).not.toBeInTheDocument()
      expect(screen.getByText('@driver.get("original")')).toBeInTheDocument()
    })

    it('saves edit on blur', async () => {
      const onEdit = vi.fn()
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("old")'
            showCode={true}
            onEdit={onEdit}
            index={1}
          />
        )
      })

      const codeElement = screen.getByText('@driver.get("old")')
      await act(async () => {
        fireEvent.doubleClick(codeElement.closest('.cursor-text')!)
      })

      const textarea = screen.getByLabelText('Edit command')
      await act(async () => {
        fireEvent.change(textarea, { target: { value: '@driver.get("blurred")' } })
      })
      await act(async () => {
        fireEvent.blur(textarea)
      })

      expect(onEdit).toHaveBeenCalledWith(1, '@driver.get("blurred")')
    })

    it('does not call onEdit when value is unchanged', async () => {
      const onEdit = vi.fn()
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("same")'
            showCode={true}
            onEdit={onEdit}
          />
        )
      })

      const codeElement = screen.getByText('@driver.get("same")')
      fireEvent.doubleClick(codeElement.closest('.cursor-text')!)

      const textarea = screen.getByLabelText('Edit command')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(onEdit).not.toHaveBeenCalled()
    })

    it('disables drag when editing', async () => {
      const onEdit = vi.fn()
      await act(async () => {
        render(
          <CommandBlock
            {...baseProps}
            command='@driver.get("test")'
            showCode={true}
            onEdit={onEdit}
          />
        )
      })

      const codeElement = screen.getByText('@driver.get("test")')
      await act(async () => {
        fireEvent.doubleClick(codeElement.closest('.cursor-text')!)
      })

      const draggableDiv = screen
        .getByLabelText('Edit command')
        .closest('[class*="rounded-lg"]') as HTMLElement
      expect(draggableDiv?.getAttribute('draggable')).toBe('false')
    })
  })
})
