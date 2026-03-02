// content.js
// Extracts the text content from the body of the active tab.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_TEXT') {
    try {
      const bodyText = document.body.innerText;
      sendResponse({ success: true, text: bodyText });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // Keep the message channel open for async responses if needed
});
