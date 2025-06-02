import React, { useState, useRef, useEffect } from 'react';
// We'll need useTranslation later if we add i18n keys
// import { useTranslation } from 'react-i18next';

// Assuming Electron.WebviewTag is available via @types/electron or similar
// If not, this might need to be 'any' or a more specific React HTML attribute type
type WebviewTag = Electron.WebviewTag; // Or any if Electron typings are not fully set up for WebviewTag

const Recorder: React.FC = (): JSX.Element => {
  // const { t } = useTranslation(); // For i18n
  const [url, setUrl] = useState<string>('');
  const [recordedSteps, setRecordedSteps] = useState<string[]>([]);
  const webviewRef = useRef<WebviewTag>(null);

  useEffect(() => {
    const webview = webviewRef.current;

    const handleDomReady = () => {
      console.log('Webview DOM ready');
      // Example: webview?.send('host-ready');
    };

    // Define the type for the event if possible, Electron.IpcMessageEvent or similar
    const handleHostMessage = (event: Event) => {
      // Cast to a more specific type if necessary, e.g., event as Electron.IpcMessageEvent
      const ipcEvent = event as Electron.IpcMessageEvent;
      if (ipcEvent.channel === 'webview-click') {
        const { selector, tagName } = ipcEvent.args[0] as { selector: string; tagName: string };
        console.log('Click captured in webview:', selector, tagName);

        // Generate Selenium Ruby command
        const escapedSelector = selector.replace(/"/g, '\\"'); // Escape double quotes in selector
        const seleniumCommand = `driver.find_element(:css, "${escapedSelector}").click # Interacted with <${tagName}>`;

        setRecordedSteps(prevSteps => [...prevSteps, seleniumCommand]);

      } else if (ipcEvent.channel === 'webview-error') {
        const { message, error } = ipcEvent.args[0] as { message: string; error?: any };
        console.error('Error from webview:', message, error);
        // Optionally, show a toast to the user: toast.error(`Error in recorder: ${message}`);
      }
    };

    if (webview) {
      webview.addEventListener('dom-ready', handleDomReady);
      webview.addEventListener('ipc-message', handleHostMessage);

      // Cleanup
      return () => {
        webview.removeEventListener('dom-ready', handleDomReady);
        webview.removeEventListener('ipc-message', handleHostMessage);
      };
    }
  }, [url]); // Re-run if URL changes, or when webviewRef becomes available.

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  };

  const handleLoadUrl = () => {
    if (webviewRef.current && url) {
      // Ensure the URL has a scheme (e.g., http:// or https://)
      let fullUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = 'https://' + url;
      }
      webviewRef.current.src = fullUrl;
      setRecordedSteps(prevSteps => [...prevSteps, `driver.get("${fullUrl}")`]);
    } else {
      console.warn('Webview ref not available or URL is empty');
      // Optionally, show a toast error to the user
    }
  };

  // Webview and recording logic will be added in subsequent steps.
  // This is the basic structure.

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={url}
          onChange={handleUrlChange}
          placeholder="Enter URL to record"
          className="flex-grow p-2 border rounded"
        />
        <button
          onClick={handleLoadUrl}
          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Load URL
        </button>
      </div>

      <div className="flex flex-row flex-grow space-x-4">
        <div className="flex-1 border rounded bg-gray-100">
          <webview
            ref={webviewRef}
            src="about:blank" // Initial blank page
            className="w-full h-full"
            preload="../preload/recorderPreload.js" // Path to the preload script
            // allowpopups // Uncomment if popups are needed
          />
        </div>
        <div className="w-1/3 border rounded p-4 bg-gray-50 flex flex-col"> {/* Added flex flex-col */}
          <h3 className="text-lg font-semibold mb-2">Recorded Steps</h3>
          <textarea
            readOnly
            value={recordedSteps.join('\n')}
            className="w-full flex-grow p-2 border rounded bg-white resize-none" // Changed h-full to flex-grow
            placeholder="Recorded Selenium Ruby commands will appear here..."
          />
        </div>
      </div>
    </div>
  );
};

export default Recorder;
