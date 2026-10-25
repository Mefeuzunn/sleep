from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import io
import numpy as np
import librosa
import tensorflow_hub as hub
import whisper

app = FastAPI(title="SleepTracker Backend")

# React Native ve mobil istemciler için CORS izni
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Yapay zeka modellerini RAM'e yüklüyoruz (Sunucu başlarken 1 kez çalışır)
print("YAMNet yükleniyor...")
yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')

print("Whisper yükleniyor...")
# Hız ve düşük RAM tüketimi için 'base' modeli
whisper_model = whisper.load_model("base")

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
        # 4. Ses konuşmaysa Whisper ile Türkçeye (veya algılanan dile) çevir
        result = whisper_model.transcribe(waveform, fp16=False, language="tr")
        text_result = result.get("text", "").strip()

    elif top_class_index == 28:
        audio_type = "snore"
    elif top_class_index == 42:
        audio_type = "cough"
    else:
        # Önemsiz bir ses (araba, kapı çarpması vb.)
        audio_type = "noise"

    print(f"Analiz tamamlandı: {audio_type} (Güven: {confidence:.2f}) - Metin: {text_result}")

    # 5. Sonucu React Native'e geri gönder
    return {
        "type": audio_type,
        "confidence": round(confidence, 4),
        "text": text_result
    }
