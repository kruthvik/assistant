# app.py — Screenshot Analyzer backend
# Receives a base64 PNG from the Firefox extension, sends it to Groq,
# and returns the text response.
#
# Install: pip install flask flask-cors groq python-dotenv

import base64
import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq

load_dotenv()  # Load .env file

app = Flask(__name__)
CORS(app)  # Allow all origins (extension requests don't always send standard Origin)

# ── Config ────────────────────────────────────────────────────────────────────

SECRET_TOKEN = os.environ.get("SA_SECRET_TOKEN", "my-local-secret-token")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL_NAME = os.environ.get("GROQ_MODEL", "llama-3.2-11b-vision-preview")

client = Groq(api_key=GROQ_API_KEY)

# ── Routes ────────────────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME})


@app.route("/analyze", methods=["POST"])
def analyze():
    # ── Auth ──────────────────────────────────────────────────────────────────
    auth_header = request.headers.get("Authorization", "")
    expected = f"Bearer {SECRET_TOKEN}"
    if auth_header != expected:
        print("[Auth] MISMATCH")
        print(f"[Auth] Got:      '{auth_header[:30]}...'")
        print(f"[Auth] Expected: '{expected[:30]}...'")
        return jsonify({"error": "Unauthorized"}), 401

    # ── Payload ───────────────────────────────────────────────────────────────
    data = request.get_json(force=True)
    if not data or "image" not in data:
        return jsonify({"error": "Missing 'image' field in request body"}), 400

    prompt = data.get(
        "prompt", "Solve the equation shown in this image."
    )

    # ── Validate base64 image ─────────────────────────────────────────────────
    try:
        base64.b64decode(data["image"])
    except Exception as e:
        return jsonify({"error": f"Invalid base64 image: {e}"}), 400

    image_b64 = data["image"]

    # ── Call Groq ─────────────────────────────────────────────────────────────
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_b64}",
                            },
                        },
                    ],
                },
            ],
            max_tokens=1024,
        )
        reply = response.choices[0].message.content
        print(f"[Groq] Response received ({len(reply)} chars)")
        return jsonify({"response": reply})

    except Exception as e:
        print(f"[Groq] Error: {e}")
        return jsonify({"error": f"Groq API error: {str(e)}"}), 502


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("[ScreenAnalyzer] Starting on http://localhost:5000")
    print(f"[ScreenAnalyzer] Model: {MODEL_NAME}")
    print(f"[ScreenAnalyzer] API Key loaded: {GROQ_API_KEY[:10]}...")
    print(f"[ScreenAnalyzer] Token loaded: {SECRET_TOKEN[:16]}...")
    app.run(port=5000, debug=False)
