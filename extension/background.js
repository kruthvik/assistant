// background.js
// Handles hotkey commands, captures screenshots, crops for snip mode,
// and forwards images to the local Python backend.

const BACKEND_URL = "http://localhost:5000/analyze";
const SECRET_TOKEN = "secret_token";

let isProcessing = false;

console.log("[ScreenAnalyzer] Background script loaded successfully");

// ─── Hotkey dispatcher ──────────────────────────────────────────────────────

browser.commands.onCommand.addListener(async (command) => {
    console.log("[ScreenAnalyzer] Command received:", command);

    if (isProcessing) {
        setBadge("...", "#888");
        return;
    }

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    if (command === "capture-full") {
        await handleFullCapture(tab);
    } else if (command === "capture-snip") {
        await handleSnipCapture(tab);
    }
});

// ─── Full capture ────────────────────────────────────────────────────────────

async function handleFullCapture(tab) {
    isProcessing = true;

    try {
        setBadge("...", "#534AB7");
        const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        const base64 = dataUrl.split(",")[1];
        await sendToBackend(tab, base64);
    } catch (err) {
        console.error("[ScreenAnalyzer] Full capture failed:", err);
        showErrorInTab(tab.id, "Capture failed: " + err.message);
    } finally {
        isProcessing = false;
        clearBadge();
    }
}

// ─── Snip capture ────────────────────────────────────────────────────────────

async function handleSnipCapture(tab) {
    // Ensure content script is injected
    await browser.tabs.executeScript(tab.id, { file: "content.js" }).catch(() => { });

    // Tell the content script to show the snip overlay
    await browser.tabs.sendMessage(tab.id, { type: "START_SNIP" });
}

// ─── Message listener (receives snip rect from content.js) ──────────────────

browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.type === "SNIP_COMPLETE") {
        const { rect } = message;
        const tab = sender.tab;

        isProcessing = true;

        try {
            setBadge("...", "#534AB7");
        } catch (e) { /* badge not available */ }

        try {
            const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
            const croppedBase64 = await cropImage(dataUrl, rect);
            await sendToBackend(tab, croppedBase64);
        } catch (err) {
            console.error("[ScreenAnalyzer] Snip capture failed:", err);
            showErrorInTab(tab.id, "Snip failed: " + err.message);
        } finally {
            isProcessing = false;
            clearBadge();
        }
    }

    if (message.type === "SNIP_CANCELLED") {
        clearBadge();
    }
});

// ─── Image cropping (OffscreenCanvas) ────────────────────────────────────────

async function cropImage(dataUrl, rect) {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);

    const dpr = rect.devicePixelRatio || 1;
    const sx = rect.x * dpr;
    const sy = rect.y * dpr;
    const sw = rect.width * dpr;
    const sh = rect.height * dpr;

    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    const outBlob = await canvas.convertToBlob({ type: "image/png" });
    return blobToBase64(outBlob);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ─── Backend request ─────────────────────────────────────────────────────────

async function sendToBackend(tab, base64Image) {
    const { systemPrompt } = await browser.storage.local.get({
        systemPrompt: "Describe what you see in this screenshot. Be concise and helpful."
    });

    const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SECRET_TOKEN}`
        },
        body: JSON.stringify({
            image: base64Image,
            prompt: systemPrompt
        })
    });

    if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    await browser.tabs.sendMessage(tab.id, {
        type: "SHOW_RESPONSE",
        text: data.response
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setBadge(text, color) {
    try {
        browser.browserAction.setBadgeText({ text });
        browser.browserAction.setBadgeBackgroundColor({ color });
    } catch (e) { /* browser_action not defined */ }
}

function clearBadge() {
    try {
        browser.browserAction.setBadgeText({ text: "" });
    } catch (e) { /* browser_action not defined */ }
}

async function showErrorInTab(tabId, message) {
    await browser.tabs.sendMessage(tabId, {
        type: "SHOW_RESPONSE",
        text: "Error: " + message,
        isError: true
    }).catch(() => { });
}
