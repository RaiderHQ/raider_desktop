import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaFolder, FaFileAlt, FaChevronDown, FaChevronRight, FaPlay, FaStop } from 'react-icons/fa';
import Button from '@components/Button';

const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [isIntegrationExpanded, setIntegrationExpanded] = useState(true);
  const [isExamplesExpanded, setExamplesExpanded] = useState(true);
  const [allSelected, setAllSelected] = useState(false);
  const [fileSelections, setFileSelections] = useState<boolean[]>([false, false, false, false]);

  const files = ['actions_spec.rb', 'aliasing_spec.rb', 'pdp_spec.rb', 'connections_spec.rb'];

  const handleIntegrationToggle = () => {
    setIntegrationExpanded(!isIntegrationExpanded);
  };

  const handleExamplesToggle = () => {
    setExamplesExpanded(!isExamplesExpanded);
  };

  const handlePlay = () => {
    console.log('Play button clicked');
  };

  const handleStop = () => {
    console.log('Stop button clicked');
  };

  const handleSelectAll = () => {
    const newSelectAll = !allSelected;
    setAllSelected(newSelectAll);
    setFileSelections(Array(files.length).fill(newSelectAll));
  };

  const handleFileCheckboxChange = (index: number) => {
    const newSelections = [...fileSelections];
    newSelections[index] = !newSelections[index];
    setFileSelections(newSelections);
    setAllSelected(newSelections.every((selected) => selected));
  };

  const handleFileClick = (fileName: string) => {
    // Navigate to the Editor view with the selected file name
    navigate('/project/editor', { state: { fileName } });
  };

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex items-center space-x-1">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={handleSelectAll}
            className="w-5 h-5 cursor-pointer border border-black rounded"
          />

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

        <Button onClick={() => console.log('Open Allure Dashboard clicked')} type="primary">
          Allure Dashboard
        </Button>
      </div>

      <div className="h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white">
        <button
          className="flex items-center w-full px-4 py-2 bg-gray-100 border-b focus:outline-none"
          onClick={handleIntegrationToggle}
        >
          {isIntegrationExpanded ? <FaChevronDown /> : <FaChevronRight />}
          <FaFolder className="ml-2 mr-2" />
          <span className="font-semibold">Integration testing</span>
        </button>

        {isIntegrationExpanded && (
          <div className="pl-8">
            <button
              className="flex items-center w-full px-4 py-2 bg-gray-50 border-b focus:outline-none"
              onClick={handleExamplesToggle}
            >
              {isExamplesExpanded ? <FaChevronDown /> : <FaChevronRight />}
              <FaFolder className="ml-2 mr-2" />
              <span className="font-semibold">examples</span>
            </button>

            {isExamplesExpanded && (
              <div className="pl-8">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center px-4 py-2 border-b cursor-pointer hover:bg-gray-100 hover:text-blue-600"
                    onClick={() => handleFileClick(file)}
                  >
                    <input
                      type="checkbox"
                      className="mr-2 w-4 h-4 cursor-pointer"
                      checked={fileSelections[index]}
                      onChange={() => handleFileCheckboxChange(index)}
                      onClick={(e) => e.stopPropagation()} // Prevent checkbox click from triggering file click
                    />
                    <FaFileAlt className="mr-2 text-gray-600" />
                    <span>{file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Overview;
