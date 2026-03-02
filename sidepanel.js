document.addEventListener('DOMContentLoaded', () => {
  const geminiKeyInput = document.getElementById('gemini-key');
  const netlifyKeyInput = document.getElementById('netlify-key');
  const geminiModelSelect = document.getElementById('gemini-model');
  const enableImageGenCheckbox = document.getElementById('enable-image-gen');
  const saveSettingsBtn = document.getElementById('save-settings');
  const publishBtn = document.getElementById('publish-btn');
  const statusOutput = document.getElementById('status-output');
  const resultLinkDiv = document.getElementById('result-link');
  const liveUrlA = document.getElementById('live-url');
  // Set up event listeners
  const customPromptInput = document.getElementById('custom-prompt');
  const scrapePageCheckbox = document.getElementById('scrape-page');
  const imageModelSelect = document.getElementById('image-model');
  const imageModelGroup = document.getElementById('image-model-group');

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
    resultLinkDiv.classList.add('hidden');
    logStatus('Starting Publish Workflow...', true);

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error('No active tab found.');
      }
      if (tab.url.startsWith('chrome://')) {
        throw new Error('Cannot run on chrome:// pages.');
      }

      logStatus(`Preparing to process tab: ${tab.title}`);

      // Tell background script to start workflow with the tab ID
      chrome.runtime.sendMessage({
        action: 'START_PUBLISH_WORKFLOW',
        tabId: tab.id,
        customPrompt: customPromptInput.value.trim(),
        scrapePage: scrapePageCheckbox.checked
      });

    } catch (error) {
      logStatus(`Error: ${error.message}`);
      publishBtn.disabled = false;
    }
  });

  // Listen for status updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
      logStatus(message.text);
    } else if (message.type === 'WORKFLOW_COMPLETE') {
      logStatus(`Deployment Complete!`);
      liveUrlA.href = message.url;
      liveUrlA.textContent = message.url;
      resultLinkDiv.classList.remove('hidden');
      publishBtn.disabled = false;
    } else if (message.type === 'WORKFLOW_ERROR') {
      logStatus(`Error: ${message.error}`);
      publishBtn.disabled = false;
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
