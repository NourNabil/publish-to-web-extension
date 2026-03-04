document.addEventListener('DOMContentLoaded', () => {
  const geminiKeyInput = document.getElementById('gemini-key');
  const netlifyKeyInput = document.getElementById('netlify-key');
  const geminiModelSelect = document.getElementById('gemini-model');
  const enableImageGenCheckbox = document.getElementById('enable-image-gen');
  const saveSettingsBtn = document.getElementById('save-settings');
  const publishBtn = document.getElementById('publish-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const statusOutput = document.getElementById('status-output');
  const resultLinkDiv = document.getElementById('result-link');
  const liveUrlA = document.getElementById('live-url');
  // Set up event listeners
  const customPromptInput = document.getElementById('custom-prompt');
  const scrapePageCheckbox = document.getElementById('scrape-page');
  const imageModelSelect = document.getElementById('image-model');
  const imageModelGroup = document.getElementById('image-model-group');
  const imageUploadInput = document.getElementById('image-upload');
  const imagePreviewList = document.getElementById('image-preview-list');
  let uploadedFiles = [];

  imageUploadInput.addEventListener('change', (e) => {
    uploadedFiles = Array.from(e.target.files);
    if (uploadedFiles.length > 0) {
      imagePreviewList.innerHTML = uploadedFiles.map(f => `<div>📄 ${f.name} (${Math.round(f.size / 1024)}kb)</div>`).join('');
    } else {
      imagePreviewList.innerHTML = '';
    }
  });

  // Load saved settings
  chrome.storage.local.get(['geminiKey', 'netlifyKey', 'geminiModel', 'imageModel', 'enableImageGen', 'customPrompt', 'scrapePage'], (result) => {
    if (result.geminiKey) geminiKeyInput.value = result.geminiKey;
    if (result.netlifyKey) netlifyKeyInput.value = result.netlifyKey;
    if (result.geminiModel) geminiModelSelect.value = result.geminiModel;
    if (result.imageModel) imageModelSelect.value = result.imageModel;
    if (result.enableImageGen !== undefined) enableImageGenCheckbox.checked = result.enableImageGen;
    if (result.customPrompt) customPromptInput.value = result.customPrompt;

    // Default to true if storage doesn't have it yet
    if (result.scrapePage !== undefined) {
      scrapePageCheckbox.checked = result.scrapePage;
    } else {
      scrapePageCheckbox.checked = true;
    }

    // Toggle image model visibility
    imageModelGroup.style.display = enableImageGenCheckbox.checked ? 'block' : 'none';

    // Auto-close settings if both keys exist
    if (result.geminiKey && result.netlifyKey) {
      document.getElementById('settings-panel').removeAttribute('open');
    }
  });

  enableImageGenCheckbox.addEventListener('change', (e) => {
    imageModelGroup.style.display = e.target.checked ? 'block' : 'none';
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', () => {
    const settings = {
      geminiKey: geminiKeyInput.value.trim(),
      netlifyKey: netlifyKeyInput.value.trim(),
      geminiModel: geminiModelSelect.value,
      imageModel: imageModelSelect.value,
      enableImageGen: enableImageGenCheckbox.checked,
      customPrompt: customPromptInput.value,
      scrapePage: scrapePageCheckbox.checked
    };

    chrome.storage.local.set(settings, () => {
      logStatus('Settings saved.');
      saveSettingsBtn.textContent = 'Saved!';
      setTimeout(() => saveSettingsBtn.textContent = 'Save Settings', 2000);
    });
  });

  // Handle Publish Click
  publishBtn.addEventListener('click', async () => {
    // Validate keys
    if (!geminiKeyInput.value.trim() || !netlifyKeyInput.value.trim()) {
      logStatus('Error: Please enter both Gemini and Netlify API keys and save them.', true);
      return;
    }

    // Auto-save the current UI values to storage before publishing
    const settings = {
      geminiKey: geminiKeyInput.value.trim(),
      netlifyKey: netlifyKeyInput.value.trim(),
      geminiModel: geminiModelSelect.value,
      imageModel: imageModelSelect.value,
      enableImageGen: enableImageGenCheckbox.checked,
      customPrompt: customPromptInput.value,
      scrapePage: scrapePageCheckbox.checked
    };
    await new Promise(resolve => chrome.storage.local.set(settings, resolve));

    publishBtn.disabled = true;
    publishBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
    cancelBtn.disabled = false;
    resultLinkDiv.classList.add('hidden');
    logStatus('Starting Publish Workflow...', true);

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error('No active tab found.');
      }

      if (scrapePageCheckbox.checked) {
        if (!tab.url) {
          throw new Error('Cannot access tab URL. You may be on a restricted page.');
        }
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
          throw new Error('Cannot scrape internal browser pages.');
        }
        logStatus(`Preparing to process tab: ${tab.title}`);
      } else {
        logStatus(`Generating site from Custom Instructions...`);
      }

      // Read uploaded images
      const uploadedImages = [];
      if (uploadedFiles.length > 0) {
        logStatus(`Reading ${uploadedFiles.length} uploaded image(s)...`);
        for (const file of uploadedFiles) {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const dataPrefixRegex = /^data:(.*?);base64,/;
          const match = base64.match(dataPrefixRegex);
          if (match) {
            uploadedImages.push({
              filename: file.name,
              mimeType: match[1],
              data: base64.replace(dataPrefixRegex, '')
            });
          }
        }
      }

      // Tell background script to start workflow with the tab ID
      chrome.runtime.sendMessage({
        action: 'START_PUBLISH_WORKFLOW',
        tabId: tab.id,
        customPrompt: customPromptInput.value.trim(),
        scrapePage: scrapePageCheckbox.checked,
        uploadedImages: uploadedImages
      });

    } catch (error) {
      logStatus(`Error: ${error.message}`);
      resetUI();
    }
  });

  cancelBtn.addEventListener('click', () => {
    cancelBtn.disabled = true;
    logStatus('Canceling workflow...');
    chrome.runtime.sendMessage({ action: 'CANCEL_WORKFLOW' });
    resetUI(); // Optimistically reset UI without waiting for background
  });

  function resetUI() {
    publishBtn.disabled = false;
    publishBtn.removeAttribute('disabled');
    publishBtn.classList.remove('hidden');
    cancelBtn.disabled = false;
    cancelBtn.removeAttribute('disabled');
    cancelBtn.classList.add('hidden');
  }

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
      logStatus(message.text);
    } else if (message.type === 'WORKFLOW_COMPLETE') {
      logStatus(`Deployment Complete!`);
      liveUrlA.href = message.url;
      liveUrlA.textContent = message.url;
      resultLinkDiv.classList.remove('hidden');
      resetUI();
    } else if (message.type === 'WORKFLOW_ERROR') {
      logStatus(`Error: ${message.error}`);
      resetUI();
    } else if (message.type === 'WORKFLOW_DISCARDED') {
      logStatus(`Draft discarded by user.`);
      resetUI();
    } else if (message.type === 'WORKFLOW_CANCELLED') {
      logStatus(`Workflow canceled by user.`);
      resetUI();
    }
  });

  function logStatus(text, clear = false) {
    if (clear) {
      statusOutput.value = '';
    }
    const time = new Date().toLocaleTimeString();
    statusOutput.value += `[${time}] ${text}\n`;
    statusOutput.scrollTop = statusOutput.scrollHeight;
  }
});
