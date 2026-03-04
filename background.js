// Load JSZip
importScripts('jszip.min.js');

// Add behavior to open the side panel when the extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const PROMPT_IMAGE_INJECT = `\nThe user may have uploaded some personal images along with this request (labeled [USER UPLOADED IMAGE: filename]). If they did, you MUST logically incorporate them into your HTML layout according to their content. Reference them EXACTLY by their filename (e.g., <img src="filename.jpg">). Do NOT generate an AI prompt for these pre-existing images; just use their filenames directly.`;

const PROMPT_IMAGE_ON = `You are an expert frontend web developer acting as an automated site generator. Input: You will be provided with raw text scraped from a user's tab, custom instructions from the user, or both. DO NOT recreate or mimic the layout or UI of the application the text was scraped from. Instead, synthesize a brand new stylized website based on what the text and instructions are asking for. CRITICAL DATA ACCURACY: You MUST use the exact facts, names, dates, times, prices, and locations found in the input text and instructions. DO NOT use generic placeholders like "[Name]" or "[Date]". If the user provides "John and Jane", put "John and Jane" in the HTML. DO NOT hallucinate, invent, or assume any details. If an expected piece of information (like a Venue or Location) is missing from the input, do NOT create a placeholder for it and do NOT invent one; omit that section or field entirely and elegantly. Design Standards: Build a modern, static, single-page application. Create a stunning, premium design with a curated, harmonious color palette (e.g., sleek dark modes or vibrant UI), modern typography, and responsive layouts. DO NOT output a plain white background. Ensure images are styled elegantly (e.g., max-width: 100%, object-fit: cover, rounded corners). Constraints: No backend databases, logged-in states, or tracking. CRITICAL - Image Handling: Do NOT use standard URL placeholders. When an image is needed to match the mood/content, format the img tag exactly like this: <img data-ai-prompt="[A highly detailed description of the image]" src="loading-placeholder.gif" data-filename="[unique-name].jpg" />. Output Format: Respond ONLY with raw code blocks for the HTML and CSS. You MUST use markdown code blocks with the language specified. The HTML MUST include <link rel="stylesheet" href="styles.css"> in the <head>. Example:\n\`\`\`html\n...\n\`\`\`\n\`\`\`css\n...\n\`\`\`\nDo NOT wrap the output in JSON. CRITICAL: Keep output concise by summarizing long text content to avoid token limits.` + PROMPT_IMAGE_INJECT;

const PROMPT_IMAGE_OFF = `You are an expert frontend web developer acting as an automated site generator. Input: You will be provided with raw text scraped from a user's tab, custom instructions from the user, or both. DO NOT recreate or mimic the layout or UI of the application the text was scraped from. Instead, synthesize a brand new stylized website based on what the text and instructions are asking for. CRITICAL DATA ACCURACY: You MUST use the exact facts, names, dates, times, prices, and locations found in the input text and instructions. DO NOT use generic placeholders like "[Name]" or "[Date]". If the user provides "John and Jane", put "John and Jane" in the HTML. DO NOT hallucinate, invent, or assume any details. If an expected piece of information (like a Venue or Location) is missing from the input, do NOT create a placeholder for it and do NOT invent one; omit that section or field entirely and elegantly. Design Standards: Build a modern, static, single-page application. Create a stunning, premium design with a curated, harmonious color palette (e.g., sleek dark modes or vibrant UI), modern typography, and responsive layouts. DO NOT output a plain white background. Constraints: No backend databases, logged-in states, or tracking. Image Handling: You cannot generate custom images. Use visually appealing CSS styling, typography, and layout instead of relying on images. Output Format: Respond ONLY with raw code blocks for the HTML and CSS. You MUST use markdown code blocks with the language specified. The HTML MUST include <link rel="stylesheet" href="styles.css"> in the <head>. Example:\n\`\`\`html\n...\n\`\`\`\n\`\`\`css\n...\n\`\`\`\nDo NOT wrap the output in JSON. CRITICAL: Keep output concise by summarizing long text content to avoid token limits.` + PROMPT_IMAGE_INJECT;

function sendStatus(text) {
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', text });
}

let currentAbortController = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_PUBLISH_WORKFLOW') {
    const tabId = request.tabId;
    const customPrompt = request.customPrompt || '';
    const scrapePage = request.scrapePage === true || request.scrapePage === undefined; // Explicit fix for undefined states
    const uploadedImages = request.uploadedImages || [];

    // Run workflow asynchronously
    runWorkflow(tabId, customPrompt, scrapePage, uploadedImages).catch(error => {
      if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('abort'))) {
        chrome.runtime.sendMessage({ type: 'WORKFLOW_CANCELLED' });
      } else {
        console.error(error);
        chrome.runtime.sendMessage({ type: 'WORKFLOW_ERROR', error: error.message });
      }
    });
  } else if (request.action === 'CONFIRM_PUBLISH') {
    deployFromPreview().catch(error => {
      console.error(error);
      chrome.runtime.sendMessage({ type: 'WORKFLOW_ERROR', error: error.message });
    });
    // Respond immediately, async work handles its own status updates
    sendResponse({ success: true });
  } else if (request.action === 'DISCARD_PREVIEW') {
    chrome.storage.local.remove('previewData');
    chrome.runtime.sendMessage({ type: 'WORKFLOW_DISCARDED' });
    sendResponse({ success: true });
  } else if (request.action === 'CANCEL_WORKFLOW') {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    sendResponse({ success: true });
  }
  return true;
});

async function runWorkflow(tabId, customPrompt, scrapePage, uploadedImages = []) {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  // 0. Load settings
  sendStatus('Loading settings...');
  const settings = await chrome.storage.local.get(['geminiKey', 'netlifyKey', 'geminiModel', 'imageModel', 'enableImageGen']);

  if (!settings.geminiKey || !settings.netlifyKey) {
    throw new Error('API Keys are missing. Please save them in the side panel.');
  }

  const { geminiKey, netlifyKey, geminiModel, imageModel, enableImageGen } = settings;

  // 1. Scrape tab content (Optional if Custom Prompt exists and scrapePage is checked)
  let pageText = "";

  if (scrapePage) {
    sendStatus('Injecting content script to scrape tab...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });

      sendStatus('Extracting text content...');
      const scrapeResult = await chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_TEXT' });
      if (scrapeResult && scrapeResult.success) {
        pageText = scrapeResult.text;
        sendStatus(`Text extracted. Length: ${pageText.length} characters.`);
      }
    } catch (err) {
      if (err.message.includes('ExtensionsSettings policy')) {
        if (!customPrompt) {
          throw new Error('Your organization has blocked extensions from reading this specific website (e.g. Google Docs/Drive). Please try a public website, OR provide a Custom Prompt instead.');
        } else {
          sendStatus('Scraping blocked by policy. Falling back to Custom Prompt only.');
        }
      } else {
        if (!customPrompt) throw err;
        sendStatus('Failed to scrape page. Falling back to Custom Prompt only.');
      }
    }
  } else {
    sendStatus('Skipping page scrape. Using custom prompt only.');
  }

  if (!pageText && !customPrompt && uploadedImages.length === 0) {
    throw new Error('Failed to extract text from the tab, and no Context was provided.');
  }

  // Combine scraped context and custom user prompt
  let finalPrompt = '';
  if (pageText) finalPrompt += `<SCRAPED_PAGE_CONTENT>\n${pageText}\n</SCRAPED_PAGE_CONTENT>\n\n`;
  if (customPrompt) finalPrompt += `<USER_CUSTOM_INSTRUCTIONS>\n${customPrompt}\n</USER_CUSTOM_INSTRUCTIONS>`;

  let contentParts = [];
  if (uploadedImages && uploadedImages.length > 0) {
    for (const img of uploadedImages) {
      // Prompt explicitly binds the filename to the multi-modal image
      contentParts.push({ text: `\n[USER UPLOADED IMAGE: ${img.filename}]\n` });
      contentParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data
        }
      });
    }
  }
  if (finalPrompt) contentParts.push({ text: finalPrompt });

  // Phase 1: Text Generation
  sendStatus(`Phase 1: Generating site using ${geminiModel}...`);
  const systemPrompt = enableImageGen ? PROMPT_IMAGE_ON : PROMPT_IMAGE_OFF;

  const generatePayload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: contentParts }],
    generationConfig: {
      response_mime_type: "text/plain",
      maxOutputTokens: 8192
    }
  };

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const textGenResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(generatePayload),
    signal
  });

  if (!textGenResponse.ok) {
    const errText = await textGenResponse.text();
    throw new Error(`Gemini Text API Error: ${textGenResponse.status} - ${errText}`);
  }

  const textGenData = await textGenResponse.json();
  let siteFiles = {};

  try {
    const rawText = textGenData.candidates[0].content.parts[0].text;
    siteFiles = {};

    // Use regex to locate code blocks
    const htmlMatch = /```html([\s\S]*?)```/gi.exec(rawText);
    const cssMatch = /```css([\s\S]*?)```/gi.exec(rawText);

    if (htmlMatch && htmlMatch[1]) {
      siteFiles['index.html'] = htmlMatch[1].trim();
    } else {
      throw new Error("Could not find ```html...``` code block in the response.");
    }

    if (cssMatch && cssMatch[1]) {
      siteFiles['styles.css'] = cssMatch[1].trim();
    } else {
      // It's possible the model didn't generate CSS, so just make it empty rather than fail
      siteFiles['styles.css'] = '';
    }

    sendStatus(`Parsed site files successfully. Found: ${Object.keys(siteFiles).join(', ')}`);
  } catch (err) {
    console.error("Raw Gemini output that failed to parse:", textGenData.candidates[0].content.parts[0].text);
    throw new Error(`Failed to parse Gemini response blocks. Error: ${err.message}. Try rerunning or shortening the input.`);
  }

  // Phase 2: Image Generation (Optional)
  let generatedImages = {};

  if (enableImageGen && siteFiles['index.html']) {
    sendStatus('Phase 2: Checking for images to generate...');
    let htmlStr = siteFiles['index.html'];

    // Regex to find <img> elements and extract prompts and filenames
    // Format: <img data-ai-prompt="..." src="..." data-filename="..." />
    const imgRegex = /<img[^>]+data-ai-prompt=(['"])(.*?)\1[^>]+data-filename=(['"])(.*?)\3[^>]*>/gi;
    const imgRegexAlt = /<img[^>]+data-filename=(['"])(.*?)\1[^>]+data-ai-prompt=(['"])(.*?)\3[^>]*>/gi;

    const promptsToGenerate = [];

    // Match standard order
    let match;
    while ((match = imgRegex.exec(htmlStr)) !== null) {
      promptsToGenerate.push({ prompt: match[2], filename: match[4] });
    }
    // Match reverse order just in case
    while ((match = imgRegexAlt.exec(htmlStr)) !== null) {
      promptsToGenerate.push({ prompt: match[4], filename: match[2] });
    }

    if (promptsToGenerate.length > 0) {
      sendStatus(`Found ${promptsToGenerate.length} image(s) to generate. Calling Gemini Image API...`);

      // Deduplicate filenames if needed
      const uniquePrompts = Array.from(new Map(promptsToGenerate.map(item => [item.filename, item])).values());

      // Generate images in parallel
      const imagePromises = uniquePrompts.map(async (imgReq) => {
        sendStatus(`Generating image: ${imgReq.filename} ...`);

        let payload;
        let url;

        // Route based on model family
        if (imageModel.startsWith('imagen-')) {
          payload = {
            instances: [{ prompt: imgReq.prompt }],
            parameters: { sampleCount: 1 }
          };
          url = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${geminiKey}`;
        } else {
          // Default to gemini- model payload
          payload = {
            contents: [{ parts: [{ text: imgReq.prompt }] }]
          };
          url = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${geminiKey}`;
        }

        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        const imgRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal
        });

        if (!imgRes.ok) {
          const errTxt = await imgRes.text();
          sendStatus(`Warning: Failed to generate ${imgReq.filename} - ${imgRes.status} ${errTxt}`);
          return null;
        }

        const imgData = await imgRes.json();

        let base64 = null;

        // Parse Imagen predict response
        if (imgData.predictions && imgData.predictions.length > 0) {
          base64 = imgData.predictions[0].bytesBase64Encoded;
        }
        // Parse Gemini generateContent response
        else if (imgData.candidates && imgData.candidates.length > 0) {
          const parts = imgData.candidates[0].content?.parts || [];
          for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
              base64 = part.inlineData.data;
              break;
            }
          }
        }

        if (base64) {
          return { filename: imgReq.filename, base64 };
        } else {
          let reason = "Unknown response structure";
          if (imgData.promptFeedback?.blockReason) {
            reason = `Blocked by safety filters (${imgData.promptFeedback.blockReason})`;
          } else if (imgData.candidates?.[0]?.finishReason) {
            reason = `Finished with reason: ${imgData.candidates[0].finishReason}`;
          } else if (imgData.error) {
            reason = `API Error: ${imgData.error.message}`;
          } else if (imgData.error?.code) {
            reason = `API Error Code: ${imgData.error.code}`;
          }
          sendStatus(`Warning: Failed to generate ${imgReq.filename} - ${reason}`);
          console.warn(`Full response for ${imgReq.filename}:`, imgData);
          return null;
        }
      });

      const imageResults = await Promise.all(imagePromises);

      imageResults.forEach(res => {
        if (res) {
          // Update index.html to preview locally with data URI later
          const dataUri = `data:image/jpeg;base64,${res.base64}`;
          generatedImages[res.filename] = dataUri;
          const replaceRegex = new RegExp(`<img[^>]*data-filename=['"]${res.filename}['"][^>]*>`, 'gi');
          htmlStr = htmlStr.replace(replaceRegex, `<img src="${dataUri}" data-filename="${res.filename}" alt="${res.filename}" />`);
        }
      });

      siteFiles['index.html'] = htmlStr;
      sendStatus(`Successfully generated ${Object.keys(generatedImages).length} image(s).`);
    } else {
      sendStatus('No valid AI image prompts found in the generated HTML. Skipping image generation.');
    }
  }

  // Inject uploaded images directly into the bundle state
  if (uploadedImages && uploadedImages.length > 0) {
    let newHtmlStr = siteFiles['index.html'] || "";
    for (const img of uploadedImages) {
      const dataUri = `data:${img.mimeType};base64,${img.data}`;
      generatedImages[img.filename] = dataUri;

      const replaceRegex1 = new RegExp(`src=['"]\\./${img.filename}['"]`, 'gi');
      const replaceRegex2 = new RegExp(`src=['"]${img.filename}['"]`, 'gi');
      newHtmlStr = newHtmlStr.replace(replaceRegex1, `src="${dataUri}"`);
      newHtmlStr = newHtmlStr.replace(replaceRegex2, `src="${dataUri}"`);
    }
    siteFiles['index.html'] = newHtmlStr;
    sendStatus(`Injected ${uploadedImages.length} uploaded image(s) into the bundle.`);
  }

  // Phase 2.5: Preview
  sendStatus('Phase 2.5: Opening Preview...');
  const previewData = {
    html: siteFiles['index.html'],
    css: siteFiles['styles.css'] || '',
    images: generatedImages,
    netlifyKey: netlifyKey
  };

  await chrome.storage.local.set({ previewData });
  chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') });
  sendStatus('Waiting for preview confirmation...');
}

async function deployFromPreview() {
  const { previewData } = await chrome.storage.local.get('previewData');
  if (!previewData) throw new Error("No preview data found to deploy.");

  // Phase 3: Bundling with JSZip
  sendStatus('Phase 3: Bundling files with JSZip...');
  const zip = new JSZip();

  let htmlStr = previewData.html;

  // Re-replace data URIs with local filenames for the bundle
  for (const [filename, dataUri] of Object.entries(previewData.images)) {
    // Simple string replace is safe because dataUri is massive and unique
    htmlStr = htmlStr.replace(dataUri, `./${filename}`);
    const base64 = dataUri.split(';base64,')[1];
    zip.file(filename, base64, { base64: true });
  }

  zip.file('index.html', htmlStr);
  if (previewData.css) {
    zip.file('styles.css', previewData.css);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  sendStatus(`Zip bundle created. Size: ${(zipBlob.size / 1024).toFixed(2)} KB.`);

  // Phase 4: Netlify Deployment
  sendStatus('Phase 4: Deploying to Netlify...');

  const netlifyRes = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${previewData.netlifyKey}`,
      'Content-Type': 'application/zip'
    },
    body: zipBlob
  });

  if (!netlifyRes.ok) {
    const errText = await netlifyRes.text();
    throw new Error(`Netlify Deployment Error: ${netlifyRes.status} - ${errText}`);
  }

  const netlifyData = await netlifyRes.json();
  const liveUrl = netlifyData.url;

  sendStatus('Parsing Netlify deployment response...');

  chrome.runtime.sendMessage({
    type: 'WORKFLOW_COMPLETE',
    url: liveUrl
  });

  // Cleanup heavy preview data from storage
  chrome.storage.local.remove('previewData');
}
