import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Assuming Electron.WebviewTag is available via @types/electron or similar
// If not, this might need to be 'any' or a more specific React HTML attribute type
type WebviewTag = Electron.WebviewTag; // Or any if Electron typings are not fully set up for WebviewTag

const injectedRecorderScript = `
  (() => {
    let isRecordingActiveForInjection = true; 

    const { ipcRenderer } = require('electron');

    function getCssSelector(el) {
      if (!el || !(el instanceof Element)) {
        return '';
      }
      const parts = [];
      let currentEl = el;
      while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
        let part = currentEl.nodeName.toLowerCase();
        if (currentEl.id) {
          part += '#' + currentEl.id;
          parts.unshift(part);
          break; 
        } else {
          let sibling = currentEl;
          let nth = 1;
          while ((sibling = sibling.previousElementSibling)) {
            if (sibling.nodeName.toLowerCase() === part) {
              nth++;
            }
          }
          if (nth > 1) {
            part += \`:nth-of-type(\${nth})\`;
          }
        }
        parts.unshift(part);
        currentEl = currentEl.parentElement;
      }
      return parts.join(' > ');
    }

    const clickListener = (event) => {
      if (!isRecordingActiveForInjection) return;
      try {
        const target = event.target;
        if (target) {
          const selector = getCssSelector(target);
          ipcRenderer.sendToHost('webview-click', {
            selector: selector,
            tagName: target.tagName.toLowerCase()
          });
        }
      } catch (error) {
        ipcRenderer.sendToHost('webview-error', {
          message: 'Error capturing click in injected script',
          error: error.message || String(error)
        });
      }
    };

    if (!document.body.hasAttribute('data-click-listener-attached')) {
        document.body.addEventListener('click', clickListener, true);
        document.body.setAttribute('data-click-listener-attached', 'true');
        console.log('[Injected Script] Click listener attached.');
    }
    
    window.__stopRecorderInjection = () => {
        isRecordingActiveForInjection = false;
    };

    console.log('[Injected Script] Recorder script injected and running.');
  })();
`;

const Recorder: React.FC = (): JSX.Element => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>('');
  const [recordedSteps, setRecordedSteps] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const webviewRef = useRef<WebviewTag>(null);

  const handleStartRecording = async () => {
    if (!webviewRef.current?.src || webviewRef.current.src === 'about:blank') {
      console.warn('Cannot start recording: Load a URL into the webview first.');
      // Optionally show a toast: toast.error(t('recorder.error.loadUrlFirst'));
      return;
    }
    // Assuming window.api is exposed by contextBridge in preload/index.ts
    if ((window as any).api && (window as any).api.startRecordingMain) {
      await (window as any).api.startRecordingMain();
      // setIsRecording(true) and webview.send will be triggered by main process signal
    } else {
      console.error('window.api.startRecordingMain is not available');
    }
  };

  const handleStopRecording = async () => {
    if ((window as any).api && (window as any).api.stopRecordingMain) {
      await (window as any).api.stopRecordingMain();
      // setIsRecording(false) and webview.send will be triggered by main process signal
    } else {
      console.error('window.api.stopRecordingMain is not available');
    }
  };

  const handleActualLoadUrlInWebview = (receivedUrl: string) => {
    console.log(`[Recorder.tsx] Received 'load-url-in-webview' for URL: ${receivedUrl}`);
    if (webviewRef.current && receivedUrl) {
      let fullUrl = receivedUrl;
      if (!receivedUrl.startsWith('http://') && !receivedUrl.startsWith('https://')) {
        fullUrl = 'https://' + receivedUrl;
      }
      webviewRef.current.src = fullUrl;
      setRecordedSteps(prevSteps => [...prevSteps, `driver.get("${fullUrl}")`]);
    } else {
      console.warn('[Recorder.tsx] Webview ref not available or received URL is empty when trying to load.');
    }
  };

  useEffect(() => {
    const handleInjectRecorderScript = () => {
      console.log('[Recorder.tsx] Received inject-recorder-script from main');
      setIsRecording(true); 
      if (webviewRef.current) {
        if (webviewRef.current.isLoading() || webviewRef.current.getURL() === 'about:blank') {
            console.warn('[Recorder.tsx] Webview is not ready for script injection (still loading or blank page). Deferring.');
            return; 
        }
        webviewRef.current.executeJavaScriptInIsolatedWorld(1, [{ code: injectedRecorderScript }])
          .then(() => console.log('[Recorder.tsx] Injected recorder script into webview.'))
          .catch(error => console.error('[Recorder.tsx] Error injecting script:', error));
      }
    };

    const handleStopRecordingSignal = () => {
      console.log('[Recorder.tsx] Received stop-recording-for-renderer from main');
      setIsRecording(false);
      if (webviewRef.current) {
        // Logic to stop recording in webview, potentially by injecting another script
        // that calls window.__stopRecorderInjection() or removes the listener.
        // For now, the injected script has __stopRecorderInjection, but we need to call it.
        // This will be handled in a subsequent step.
        // For now, just log or if the script handles the isRecordingActiveForInjection flag correctly,
        // this might be enough if the click listener checks it.
        // However, the current injected script does not have its own 'stop' IPC listener from webview.
        // It relies on window.__stopRecorderInjection being called.
         webviewRef.current.executeJavaScriptInIsolatedWorld(1, [{code: "if(window.__stopRecorderInjection) window.__stopRecorderInjection();"}])
          .then(() => console.log('[Recorder.tsx] Executed stop command in webview.'))
          .catch(error => console.error('[Recorder.tsx] Error executing stop command in webview:', error));
      }
    };

    if ((window as any).electron && (window as any).electron.ipcRenderer) {
      (window as any).electron.ipcRenderer.on('inject-recorder-script', handleInjectRecorderScript);
      (window as any).electron.ipcRenderer.on('stop-recording-for-renderer', handleStopRecordingSignal);
      (window as any).electron.ipcRenderer.on('load-url-in-webview', handleActualLoadUrlInWebview);

      return () => {
        (window as any).electron.ipcRenderer.removeListener('inject-recorder-script', handleInjectRecorderScript);
        (window as any).electron.ipcRenderer.removeListener('stop-recording-for-renderer', handleStopRecordingSignal);
        (window as any).electron.ipcRenderer.removeListener('load-url-in-webview', handleActualLoadUrlInWebview);
      };
    } else {
      console.warn('[Recorder.tsx] window.electron.ipcRenderer not available for main process listeners.');
    }
    return () => {}; // Ensure a cleanup function is always returned
  }, [handleActualLoadUrlInWebview]);

  useEffect(() => {
    const webview = webviewRef.current;

    const handleDomReady = () => {
      console.log('[Webview] Event: dom-ready');
      // Example: webview?.send('host-ready');
    };

    const handleHostMessage = (event: Event) => {
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

    // Additional Webview Event Listeners
    const handleDidStartLoading = () => { console.log('[Webview] Event: did-start-loading'); };
    const handleDidStopLoading = () => { console.log('[Webview] Event: did-stop-loading'); };
    const handleDidFailLoad = (event: any) => { console.error('[Webview] Event: did-fail-load', { errorCode: event.errorCode, errorDescription: event.errorDescription, validatedURL: event.validatedURL, isMainFrame: event.isMainFrame }); };
    const handleConsoleMessage = (event: any) => { console.log('[Webview Guest Console]', { level: event.level, message: event.message, line: event.line, sourceId: event.sourceId }); };
    const handleDidNavigate = (event: any) => { console.log('[Webview] Event: did-navigate', { url: event.url, isMainFrame: event.isMainFrame }); };
    const handleDidFinishLoad = () => { console.log('[Webview] Event: did-finish-load (main frame finished loading)'); };

    if (webview) {
      webview.addEventListener('dom-ready', handleDomReady);
      webview.addEventListener('ipc-message', handleHostMessage);
      webview.addEventListener('did-start-loading', handleDidStartLoading);
      webview.addEventListener('did-stop-loading', handleDidStopLoading);
      webview.addEventListener('did-fail-load', handleDidFailLoad);
      webview.addEventListener('console-message', handleConsoleMessage);
      webview.addEventListener('did-navigate', handleDidNavigate);
      webview.addEventListener('did-finish-load', handleDidFinishLoad);

      // Cleanup
      return () => {
        webview.removeEventListener('dom-ready', handleDomReady);
        webview.removeEventListener('ipc-message', handleHostMessage);
        webview.removeEventListener('did-start-loading', handleDidStartLoading);
        webview.removeEventListener('did-stop-loading', handleDidStopLoading);
        webview.removeEventListener('did-fail-load', handleDidFailLoad);
        webview.removeEventListener('console-message', handleConsoleMessage);
        webview.removeEventListener('did-navigate', handleDidNavigate);
        webview.removeEventListener('did-finish-load', handleDidFinishLoad);
      };
    }
  }, [url]); // Re-run if URL changes, or when webviewRef becomes available.

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  };

  const handleLoadUrlButtonClick = () => {
    if (url) {
      if ((window as any).api && (window as any).api.loadUrlRequest) {
        (window as any).api.loadUrlRequest(url);
      } else {
        console.error('window.api.loadUrlRequest is not available');
        // Fallback or error message to user
      }
    } else {
      console.warn('URL is empty. Please enter a URL.');
      // Optionally, show a toast to the user
      // toast.error(t('recorder.error.emptyUrl')); // Example, requires new translation key
    }
  };

  // Webview and recording logic will be added in subsequent steps.
  // This is the basic structure.

  return (
    <div className="flex flex-col h-full w-full p-4 space-y-4">
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={url}
          onChange={handleUrlChange}
          placeholder={t('recorder.placeholder.url')}
          className="flex-grow p-2 border rounded"
        />
        <button
          onClick={handleLoadUrlButtonClick}
          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {t('recorder.button.loadUrl')}
        </button>
        <button
          onClick={handleStartRecording}
          disabled={isRecording || !url || (webviewRef.current?.src === 'about:blank')}
          className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          {t('recorder.button.startRecording')}
        </button>
        <button
          onClick={handleStopRecording}
          disabled={!isRecording}
          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
        >
          {t('recorder.button.stopRecording')}
        </button>
      </div>

      <div className="flex flex-row flex-grow space-x-4">
        {/* Recorded Steps sidebar div - MOVED TO BE FIRST (LEFT) */}
        <div className="w-96 border rounded p-4 bg-gray-50 flex flex-col">
          <h3 className="text-lg font-semibold mb-2">{t('recorder.heading.recordedSteps')}</h3>
          <textarea
            readOnly
            value={recordedSteps.join('\n')}
            className="w-full flex-grow p-2 border rounded bg-white resize-none"
            placeholder={t('recorder.placeholder.commands')}
          />
        </div>

        {/* Webview container div - NOW SECOND (RIGHT) */}
        <div className="flex-1 border rounded bg-gray-100">
          <webview
            ref={webviewRef}
            src="about:blank" // Initial blank page
            className="w-full h-full"
            preload="../preload/recorderPreload.js" // Path to the preload script
            // allowpopups // Uncomment if popups are needed
          />
        </div>
      </div>
    </div>
  );
};

export default Recorder;
