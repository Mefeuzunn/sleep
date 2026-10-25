from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import io
import os
import numpy as np
import librosa
import tensorflow_hub as hub
import whisper
import uvicorn
from openai import OpenAI

app = FastAPI(title="SleepTracker Backend")

# React Native ve mobil istemciler için CORS izni
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ortam Değişkenleri
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# Yapay zeka modelleri (RAM Optimizasyonu)
print("YAMNet modeli yükleniyor...")
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')
print("YAMNet hazır.")

# Eğer OpenAI API Key tanımlıysa RAM tasarrufu için lokal Whisper modeli yüklenmez
whisper_model = None
if not openai_client:
    print("OPENAI_API_KEY bulunamadı, lokal Whisper modeli (tiny/base) yükleniyor...")
    # Bulut başlangıç seviyesi için 'tiny' modeli en hafifidir (~75MB RAM)
    whisper_model_name = os.getenv("WHISPER_MODEL", "tiny")
    whisper_model = whisper.load_model(whisper_model_name)
    print(f"Lokal Whisper ({whisper_model_name}) hazır.")
else:
    print("OpenAI API Key aktif: Konuşma analizleri bulut API üzerinden yapılacak (RAM tasarrufu sağlandı).")


@app.get("/")
def health_check():
    return {
        "status": "online",
        "service": "SleepTracker AI Engine",
        "whisper_mode": "OpenAI Cloud API" if openai_client else "Local Whisper Model",
    }


@app.post("/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    # 1. Dosyayı diske yazmadan doğrudan belleğe (RAM) alıyoruz
    audio_bytes = await file.read()
    wav_stream = io.BytesIO(audio_bytes)

    # 2. Sesi YAMNet ve Whisper'ın anladığı 16kHz Mono Float32 formatına çeviriyoruz
    waveform, sr = librosa.load(wav_stream, sr=16000, mono=True)

    # 3. YAMNet ile Ses Sınıflandırması
    scores, embeddings, spectrogram = yamnet_model(waveform)
    class_scores = np.mean(scores, axis=0)
    top_class_index = int(np.argmax(class_scores))
    confidence = float(class_scores[top_class_index])

    # YAMNet indeksleri: 0 -> Speech (Konuşma), 28 -> Snoring (Horlama), 42 -> Cough (Öksürük)
    audio_type = "unknown"
    text_result = None

    if top_class_index == 0:
        audio_type = "speech"

        # 4. Ses konuşmaysa Whisper ile metne çevir
        if openai_client:
            try:
                # Diske yazmadan BytesIO ile OpenAI Cloud API'ye gönder (0 MB RAM harcar)
                audio_file_payload = ("audio.wav", io.BytesIO(audio_bytes), "audio/wav")
                transcript = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file_payload,
                    language="tr",
                )
                text_result = transcript.text.strip()
            except Exception as api_err:
                print(f"OpenAI API Hatası: {api_err}")
                text_result = None
        elif whisper_model:
            # Lokal model ile çözümle
            result = whisper_model.transcribe(waveform, fp16=False, language="tr")
            text_result = result.get("text", "").strip()

    elif top_class_index == 28:
        audio_type = "snore"
    elif top_class_index == 42:
        audio_type = "cough"
    else:
        # Önemsiz bir ses (araba, kapı çarpması vb.)
        audio_type = "noise"

    print(f"Analiz sonucu: {audio_type} (Güven: {confidence:.2f}) - Metin: {text_result}")

    # 5. Sonucu React Native'e geri gönder
    return {
        "type": audio_type,
        "confidence": round(confidence, 4),
        "text": text_result,
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
