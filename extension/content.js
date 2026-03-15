// content.js
// Injected into all pages. Handles:
//   1. The snip selection overlay (drag to select a rect)
//   2. The response overlay panel (shows Gemini's answer)

(function () {
    // Guard against double-injection
    if (window.__screenshotAnalyzerLoaded) return;
    window.__screenshotAnalyzerLoaded = true;

    // ─── Message router ───────────────────────────────────────────────────────

    browser.runtime.onMessage.addListener((message) => {
        if (message.type === "START_SNIP") startSnip();
        if (message.type === "SHOW_RESPONSE") showResponse(message.text, message.isError);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // SNIP OVERLAY
    // ═══════════════════════════════════════════════════════════════════════════

    function startSnip() {
        // Prevent multiple overlays
        if (document.getElementById("sa-snip-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "sa-snip-overlay";
        // Styles are in content.css; just set the class
        document.body.appendChild(overlay);

        const selection = document.createElement("div");
        selection.id = "sa-snip-selection";
        overlay.appendChild(selection);

        const hint = document.createElement("div");
        hint.id = "sa-snip-hint";
        hint.textContent = "Drag to select a region  •  Esc to cancel";
        overlay.appendChild(hint);

        const dims = document.createElement("div");
        dims.id = "sa-snip-dims";
        overlay.appendChild(dims);

        let startX = 0, startY = 0;
        let isDragging = false;

        function onMouseDown(e) {
            if (e.button !== 0) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            updateSelection(e.clientX, e.clientY, e.clientX, e.clientY);
            selection.style.display = "block";
            hint.style.display = "none";
            e.preventDefault();
        }

        function onMouseMove(e) {
            if (!isDragging) return;
            updateSelection(startX, startY, e.clientX, e.clientY);

            // Show live dimensions
            const w = Math.abs(e.clientX - startX);
            const h = Math.abs(e.clientY - startY);
            dims.textContent = `${Math.round(w)} × ${Math.round(h)}`;
            dims.style.left = (Math.min(startX, e.clientX) + 4) + "px";
            dims.style.top = (Math.min(startY, e.clientY) - 22) + "px";
            dims.style.display = w > 20 ? "block" : "none";
        }

        function onMouseUp(e) {
            if (!isDragging) return;
            isDragging = false;

            const x = Math.min(startX, e.clientX);
            const y = Math.min(startY, e.clientY);
            const width = Math.abs(e.clientX - startX);
            const height = Math.abs(e.clientY - startY);

            cleanup();

            if (width < 10 || height < 10) {
                // Too small — cancel
                browser.runtime.sendMessage({ type: "SNIP_CANCELLED" });
                return;
            }

            browser.runtime.sendMessage({
                type: "SNIP_COMPLETE",
                rect: {
                    x,
                    y,
                    width,
                    height,
                    devicePixelRatio: window.devicePixelRatio || 1
                }
            });
        }

        function onKeyDown(e) {
            if (e.key === "Escape") {
                cleanup();
                browser.runtime.sendMessage({ type: "SNIP_CANCELLED" });
            }
        }

        function updateSelection(x1, y1, x2, y2) {
            const l = Math.min(x1, x2);
            const t = Math.min(y1, y2);
            const w = Math.abs(x2 - x1);
            const h = Math.abs(y2 - y1);
            selection.style.left = l + "px";
            selection.style.top = t + "px";
            selection.style.width = w + "px";
            selection.style.height = h + "px";
        }

        function cleanup() {
            overlay.removeEventListener("mousedown", onMouseDown);
            overlay.removeEventListener("mousemove", onMouseMove);
            overlay.removeEventListener("mouseup", onMouseUp);
            document.removeEventListener("keydown", onKeyDown);
            overlay.remove();
        }

        overlay.addEventListener("mousedown", onMouseDown);
        overlay.addEventListener("mousemove", onMouseMove);
        overlay.addEventListener("mouseup", onMouseUp);
        document.addEventListener("keydown", onKeyDown);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESPONSE OVERLAY
    // ═══════════════════════════════════════════════════════════════════════════

    function showResponse(text, isError = false) {
        // Remove any existing panel
        const existing = document.getElementById("sa-response-panel");
        if (existing) existing.remove();

        const panel = document.createElement("div");
        panel.id = "sa-response-panel";
        if (isError) panel.classList.add("sa-error");

        // Header
        const header = document.createElement("div");
        header.id = "sa-response-header";

        const title = document.createElement("span");
        title.id = "sa-response-title";
        title.textContent = isError ? "Error" : "Gemini";

        const closeBtn = document.createElement("button");
        closeBtn.id = "sa-response-close";
        closeBtn.textContent = "✕";
        closeBtn.title = "Close (Esc)";
        closeBtn.addEventListener("click", () => panel.remove());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Body
        const body = document.createElement("div");
        body.id = "sa-response-body";
        body.textContent = text;

        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        // Dismiss on Escape (only when panel exists)
        function onEscape(e) {
            if (e.key === "Escape") {
                panel.remove();
                document.removeEventListener("keydown", onEscape);
            }
        }
        document.addEventListener("keydown", onEscape);

        // Animate in
        requestAnimationFrame(() => panel.classList.add("sa-visible"));
    }
})();
