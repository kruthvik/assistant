// options.js
const promptEl = document.getElementById("prompt");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

// Use whichever API is available (chrome for Chrome, browser for Firefox)
const api = typeof browser !== "undefined" ? browser : chrome;

// Load saved prompt
api.storage.local.get({ systemPrompt: "" }).then((result) => {
    if (result.systemPrompt) {
        promptEl.value = result.systemPrompt;
    }
});

saveBtn.addEventListener("click", () => {
    api.storage.local.set({ systemPrompt: promptEl.value }).then(() => {
        statusEl.textContent = "Saved!";
        setTimeout(() => { statusEl.textContent = ""; }, 2000);
    });
});
