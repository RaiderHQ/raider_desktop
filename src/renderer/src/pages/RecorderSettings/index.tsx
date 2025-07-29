import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import InputField from '@components/InputField'

const RecordingSettings: React.FC = () => {
  const { t } = useTranslation()
  const [implicitWait, setImplicitWait] = useState(0)
  const [explicitWait, setExplicitWait] = useState(30)
  const [selectorPriorities, setSelectorPriorities] = useState<string[]>([])
  const [newSelector, setNewSelector] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)

  useEffect(() => {
    const savedImplicitWait = localStorage.getItem('implicitWait')
    if (savedImplicitWait) {
      setImplicitWait(Number(savedImplicitWait))
    }
    const savedExplicitWait = localStorage.getItem('explicitWait')
    if (savedExplicitWait) {
      setExplicitWait(Number(savedExplicitWait))
    }
    window.api.getSelectorPriorities().then(setSelectorPriorities)
  }, [])

  const handleImplicitWaitChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setImplicitWait(Number(event.target.value))
  }

  const handleExplicitWaitChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setExplicitWait(Number(event.target.value))
  }

  const handleUpdateClick = async (): Promise<void> => {
    setIsUpdating(true)
    try {
      await window.api.updateRecordingSettings({ implicitWait, explicitWait })
      await window.api.saveSelectorPriorities(selectorPriorities)
      localStorage.setItem('implicitWait', implicitWait.toString())
      localStorage.setItem('explicitWait', explicitWait.toString())
      toast.success(t('settings.recording.recordingUpdateSuccess'))
    } catch (error) {
      toast.error(`${t('settings.recording.error.unexpected')} : ${error}`)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAddSelector = (): void => {
    if (newSelector && !selectorPriorities.includes(newSelector)) {
      setSelectorPriorities([...selectorPriorities, newSelector])
      setNewSelector('')
    }
  }

  const handleDeleteSelector = (selectorToDelete: string): void => {
    setSelectorPriorities(selectorPriorities.filter((s) => s !== selectorToDelete))
  }

  const handleDragStart = (index: number): void => {
    dragItem.current = index
  }

  const handleDragEnter = (index: number): void => {
    dragOverItem.current = index
  }

  const handleDragEnd = (): void => {
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const newPriorities = [...selectorPriorities]
      const draggedItemContent = newPriorities.splice(dragItem.current, 1)[0]
      newPriorities.splice(dragOverItem.current, 0, draggedItemContent)
      dragItem.current = null
      dragOverItem.current = null
      setSelectorPriorities(newPriorities)
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold">{t('settings.recording.title')}</h2>
      <p className="mb-4">{t('settings.recording.description')}</p>

      <div className="border border-gray-300 rounded-lg p-4">
        <label htmlFor="implicit-wait" className="font-medium mr-2">
          {t('settings.recording.implicitWait.label')}
        </label>
        <input
          type="number"
          id="implicit-wait"
          value={implicitWait}
          onChange={handleImplicitWaitChange}
          className="border p-1 rounded mt-2"
          min="0"
        />
        <p className="text-sm text-gray-500 mt-1">
          {t('settings.recording.implicitWait.description')}
        </p>
      </div>

      <div className="border border-gray-300 rounded-lg p-4 mt-4">
        <label htmlFor="explicit-wait" className="font-medium mr-2">
          {t('settings.recording.explicitWait.label')}
        </label>
        <input
          type="number"
          id="explicit-wait"
          value={explicitWait}
          onChange={handleExplicitWaitChange}
          className="border p-1 rounded mt-2"
          min="0"
        />
        <p className="text-sm text-gray-500 mt-1">
          {t('settings.recording.explicitWait.description')}
        </p>
      </div>

      <div className="border border-gray-300 rounded-lg p-4 mt-4">
        <h3 className="text-lg font-bold mb-2">Selector Priorities</h3>
        <p className="text-sm text-gray-500 mb-4">
          Drag and drop to reorder selector priorities. The recorder will try to find elements using
          this order.
        </p>
        <div className="flex items-center mb-4">
          <InputField
            value={newSelector}
            onChange={(e) => setNewSelector(e.target.value)}
            placeholder="e.g., data-testid"
          />
          <Button onClick={handleAddSelector} type="primary" className="ml-2">
            Add
          </Button>
        </div>
        <div>
          {selectorPriorities.map((selector, index) => (
            <div
              key={selector}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className="flex items-center justify-between p-2 my-1 bg-gray-100 rounded cursor-move"
            >
              <span>{selector}</span>
              <Button onClick={() => handleDeleteSelector(selector)} type="secondary">
                Delete
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Button onClick={handleUpdateClick} type="primary" disabled={isUpdating}>
          {t('settings.recording.updateRecordingSettingsButton')}
        </Button>
      </div>
    </div>
  )
}

export default RecordingSettings
