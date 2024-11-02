import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlay, FaStop } from 'react-icons/fa';
import Button from '@components/Button';

interface FileEditorProps {
  fileName: string;
  initialContent: string;
}

const Editor: React.FC<FileEditorProps> = ({ fileName, initialContent }) => {
  const [fileContent, setFileContent] = useState(initialContent);
  const navigate = useNavigate();

  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFileContent(event.target.value);
  };

  const handlePlay = () => {
    console.log('Play button clicked');
  };

  const handleStop = () => {
    console.log('Stop button clicked');
  };

  const handleSave = () => {
    console.log(`File "${fileName}" saved with content:`, fileContent);
    // Additional save logic can be added here
  };

  const handleBackToOverview = () => {
    navigate('/project/overview'); // Redirect to the Overview page
  };

  return (
    <div className="flex flex-col w-screen h-screen p-8">
      {/* Toolbar with Play, Stop, Back, and Save buttons */}
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex items-center space-x-1">
          <button
            onClick={handlePlay}
            className="text-green-500 border border-green-500 rounded w-5 h-5 flex items-center justify-center hover:bg-green-50"
            title="Play"
          >
            <FaPlay size={12} />
          </button>
          <button
            onClick={handleStop}
            className="text-red-500 border border-red-500 rounded w-5 h-5 flex items-center justify-center hover:bg-red-50"
            title="Stop"
          >
            <FaStop size={12} />
          </button>
        </div>

        <div className="flex space-x-2">
          <Button onClick={handleBackToOverview} type="secondary">
            Back to Overview
          </Button>
          <Button onClick={handleSave} type="primary">
            Save
          </Button>
        </div>
      </div>

      {/* File Content Editor */}
      <div className="flex flex-col flex-grow border rounded-lg shadow-sm overflow-hidden bg-white p-4">
        <h2 className="text-xl font-semibold mb-4">actions_spec.rb</h2>
        <textarea
          value={fileContent}
          onChange={handleContentChange}
          className="flex-grow border p-2 rounded-lg w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Start editing file content here..."
        />
      </div>
    </div>
  );
};

export default Editor;
