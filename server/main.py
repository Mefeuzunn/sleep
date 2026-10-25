import os
import io
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import librosa
import tensorflow_hub as hub
from openai import OpenAI
import uvicorn

app = FastAPI(title="SleepTracker Backend")

# React Native ve mobil istemciler için CORS izni
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. OpenAI İstemcisini Başlat (API anahtarını ortam değişkeninden çeker)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

print("YAMNet yükleniyor (Düşük RAM tüketimi)...")
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')
print("YAMNet hazır.")


@app.get("/")
def health_check():
    return {
        "status": "online",
        "service": "SleepTracker AI Engine (OpenAI API Cloud Mode)",
        "ram_optimized": True,
    }


@app.post("/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    wav_stream = io.BytesIO(audio_bytes)

    # 2. Sesi YAMNet için uygun formata (16kHz Mono) getir
    waveform, sr = librosa.load(wav_stream, sr=16000, mono=True)

    # 3. YAMNet ile Sınıflandırma
    scores, embeddings, spectrogram = yamnet_model(waveform)
    class_scores = np.mean(scores, axis=0)
    top_class_index = int(np.argmax(class_scores))
    confidence = float(class_scores[top_class_index])

    audio_type = "unknown"
    text_result = None

    if top_class_index == 0:
        audio_type = "speech"

        # 4. Eğer konuşmaysa, veriyi diske yazmadan doğrudan OpenAI API'ye gönder
        try:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                # OpenAI API'si dosya adı ve uzantısına ihtiyaç duyar
                file=("uyku_sesi.wav", audio_bytes, "audio/wav"),
                language="tr",
            )
            text_result = response.text.strip()
        except Exception as e:
            print("OpenAI API Hatası:", e)
            text_result = "Metne çevrilemedi."

    elif top_class_index == 28:
        audio_type = "snore"
    elif top_class_index == 42:
        audio_type = "cough"
    else:
        audio_type = "noise"

    print(f"Analiz tamamlandı: {audio_type} (Güven: {confidence:.2f}) - Metin: {text_result}")

    return {
        "type": audio_type,
        "confidence": round(confidence, 4),
        "text": text_result,
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
