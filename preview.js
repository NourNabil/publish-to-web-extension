document.addEventListener('DOMContentLoaded', async () => {
  const iframe = document.getElementById('preview-container');
  const discardBtn = document.getElementById('discard-btn');
  const publishBtn = document.getElementById('publish-btn');
  const statusEl = document.getElementById('publish-status');

  // Load the generated files from local storage (handles large >10MB payloads)
  const data = await chrome.storage.local.get('previewData');

  if (!data || !data.previewData || !data.previewData.html) {
    iframe.srcdoc = "<h1>Error: No preview data found</h1>";
    return;
  }

  const { html, css, js } = data.previewData;

  // Reconstruct the full HTML string for the iframe
  let fullHtml = html;

  // Inject CSS
  if (css) {
    const styleTag = `<style>${css}</style>`;
    if (fullHtml.includes('</head>')) {
      fullHtml = fullHtml.replace('</head>', `${styleTag}</head>`);
    } else {
      fullHtml = `<head>${styleTag}</head>${fullHtml}`;
    }
  }

  // Inject JS if any
  if (js) {
    const scriptTag = `<script>${js}</script>`;
    if (fullHtml.includes('</body>')) {
      fullHtml = fullHtml.replace('</body>', `${scriptTag}</body>`);
    } else {
      fullHtml += scriptTag;
    }
  }

  iframe.srcdoc = fullHtml;

  // Handle Discard
  discardBtn.addEventListener('click', () => {
    discardBtn.disabled = true;
    publishBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'DISCARD_PREVIEW' }, () => {
      window.close();
    });
  });

  // Handle Publish
  publishBtn.addEventListener('click', () => {
    publishBtn.disabled = true;
    discardBtn.disabled = true;
    publishBtn.style.opacity = '0.5';
    statusEl.style.display = 'block';

    chrome.runtime.sendMessage({ action: 'CONFIRM_PUBLISH' }, (response) => {
      // The background script will handle the zipping and netlify uploading
      // It will send a status update back to the sidepanel and open the URL eventually
      statusEl.textContent = 'Published! You can close this tab.';
    });
  });
});
