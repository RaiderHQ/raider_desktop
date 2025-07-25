import React from 'react'
import Button from '@components/Button'

interface DeleteModalProps {
  testName: string
  onConfirm: () => void
  onCancel: () => void
}

const DeleteModal: React.FC<DeleteModalProps> = ({ testName, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-1/3">
        <h2 className="text-lg font-semibold mb-4">Confirm Deletion</h2>
        <p className="mb-4">
          Are you sure you want to delete the test <span className="font-bold">{testName}</span>?
        </p>
        <div className="flex justify-end space-x-2">
          <Button onClick={onCancel} type="secondary">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="danger">
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DeleteModal
