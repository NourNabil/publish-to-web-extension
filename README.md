# Publish to Web Chrome Extension 🚀

**Publish to Web** is a powerful Chrome Extension that acts as your AI-driven website generator and deployment pipeline. It effortlessly transforms the content of any webpage you are currently reading—or a custom prompt you provide—into a beautiful, fully functional, deployed static website in seconds.

## ✨ Features

- **Context-Aware Generation**: Scrape the text of your active Chrome tab to provide instant context to the AI.
- **Custom Instructions**: Bypass scraping or augment it by providing your own custom design instructions and prompts.
- **Gemini Text & Image Generation**: 
  - Uses Google's state-of-the-art **Gemini Flash/Pro** models to write all HTML, CSS, and copy logic.
  - Dynamically routes to **Gemini Image** or **Imagen 3** models to generate custom photography and assets based on the webpage's context.
- **Local Preview Sandbox**: Interactively preview your newly generated website in a full-screen local sandbox before pushing it live.
- **One-Click Netlify Deployment**: Automatically bundles all generated HTML, CSS, and Images into a ZIP archive and deploys it globally via the Netlify API.

## 🛠️ Prerequisites

To use this extension, you will need two API keys:
1. **Gemini API Key**: Get one from [Google AI Studio](https://aistudio.google.com/).
2. **Netlify Personal Access Token**: Generate one in your [Netlify User Settings](https://app.netlify.com/user/applications#personal-access-tokens).

## 🚀 Installation

Because this is a developer prototype, it is not available on the Chrome Web Store. To install it locally:

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/NourNabil/publish-to-web-extension.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the `publish-to-web-extension` folder. The extension will now appear in your toolbar!

## 📖 How to Use

1. **Pin the Extension**: Click the puzzle piece icon in Chrome and pin the "Publish to Web" extension for easy access.
2. **Open the Side Panel**: Click the extension icon to open the interactive side panel.
3. **Save Your API Keys**: Expand the "Settings & API Keys" dropdown, paste your Gemini and Netlify keys, and hit "Save Settings". (Your keys are securely saved to your local Chrome storage).
4. **Choose Your Source**:
   - Navigate to any webpage you want to transform (e.g., a Wikipedia article, a recipe blog). Ensure "Include content from current tab" is checked.
   - Alternatively, uncheck it and type a highly detailed description in the "Custom Instructions" box.
5. **Configure AI Generation**: 
   - Select your preferred Text Model.
   - Toggle "Enable AI Image Generation" and choose your preferred image model.
6. **Draft Site**: Click the **"Draft Site"** button. The extension will:
   - Scrape the page (if enabled).
   - Generate HTML/CSS via Gemini.
   - Generate contextual image assets via Gemini/Imagen.
7. **Preview and Deploy**: A new Chrome tab will open with a full-page local preview of your generated site. 
   - If you don't like it, click **Discard** (this cleans up the local cache).
   - If it looks great, click **Publish to Web**. The extension will bundle the assets and give you a live Netlify URL instantly!

## 🏗️ Technology Stack

- **Extension Framework**: Chrome Extensions V3 (SidePanel API, Scripting API, Local Storage)
- **AI Integration**: Google Generative AI APIs (`generateContent` & `predict` endpoints)
- **Bundling**: [JSZip](https://stuk.github.io/jszip/) for client-side ZIP archive generation.
- **Hosting**: Netlify Sites API.
- **UI/UX**: Vanilla HTML/CSS/JavaScript.

## ⚠️ Limitations & Notes

- **Image Safety**: Gemini APIs have strict safety and copyright filters. Prompting for explicitly trademarked characters (e.g., "Spiderman", "Mickey Mouse") will result in the image being blocked by the API. The extension will log a warning if this occurs and skip the image.
- **Target Size**: Generating extremely massive websites with dozens of images may test the boundaries of LLM generation times and browser memory. 

---
*Built as a proof-of-concept for automated agentic deployment pipelines.*
