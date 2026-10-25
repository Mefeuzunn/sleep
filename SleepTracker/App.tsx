import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  Text,
  Button,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import BackgroundJob from 'react-native-background-actions';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import axios from 'axios';
import { supabase } from './supabase';
import SleepReportScreen from './SleepReportScreen';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const THRESHOLD_DB = 40;
const SILENCE_DELAY_MS = 2000; // 2 saniye sessizlik olunca kaydı bitir

const options = {
  sampleRate: SAMPLE_RATE,
  channels: CHANNELS,
  bitsPerSample: BITS_PER_SAMPLE,
  audioSource: 6, // Android için VOICE_RECOGNITION
  bufferSize: 4096,
  wavFile: 'temp_stream.wav',
};

const bgOptions = {
  taskName: 'SleepTracker',
  taskTitle: 'Uyku Takibi Aktif',
  taskDesc: 'Arka planda uyku sesleri analiz ediliyor...',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  color: '#6200ee',
  parameters: { delay: 1000 },
};

// Standart 44 byte WAV Header
const createWavHeader = (dataLength: number) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(dataLength + 36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  header.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
};

interface AnalysisResult {
  type: string;
  confidence?: number;
  text?: string;
  timestamp: string;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'tracker' | 'report'>('tracker');
  const [serverUrl, setServerUrl] = useState('http://10.0.2.2:8000'); // Android emülatör varsayılanı (fiziksel cihaz için PC IP'si)
  const [dbLevel, setDbLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isRecordingSound, setIsRecordingSound] = useState(false);
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisResult[]>([]);

  // Referanslar
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const isRecordingRef = useRef(false);
  const audioChunksRef = useRef<Buffer[]>([]);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dosyayı oluşturup FastAPI sunucusuna gönderen ve ardından Supabase'e kaydedip yerel kopyayı silen fonksiyon
  const sendToAI = async (filePath: string) => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? `file://${filePath}` : filePath,
        name: 'sleep_audio.wav',
        type: 'audio/wav',
      } as unknown as Blob);

      console.log('FastAPI sunucusuna ses gönderiliyor:', `${serverUrlRef.current}/analyze-audio`);
      const response = await axios.post(`${serverUrlRef.current}/analyze-audio`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 15000,
      });

      console.log('Yapay Zeka Sonucu:', response.data);
      const { type, confidence, text } = response.data;

      const newResult: AnalysisResult = {
        type: type || 'Bilinmiyor',
        confidence: confidence,
        text: text,
        timestamp: new Date().toLocaleTimeString(),
      };

      setAnalysisLogs(prev => [newResult, ...prev.slice(0, 9)]);

      // 3. Analiz Sonucunu Supabase Veritabanına Kaydetme
      if (type !== 'noise' && type !== 'unknown') {
        const todaySession = new Date().toISOString().split('T')[0]; // Örn: 2026-10-25

        const { error: dbError } = await supabase.from('sleep_events').insert([
          {
            session_id: todaySession,
            event_type: type,
            transcript: text || null,
            confidence: confidence || null,
          },
        ]);

        if (dbError) {
          console.error('Supabase kayıt hatası:', dbError);
        } else {
          console.log('Olay Supabase veritabanına kaydedildi:', type);
        }
      }
    } catch (error) {
      console.error('Yapay zekaya gönderim hatası:', error);
    } finally {
      // Mahremiyet ve depolama optimizasyonu: Cihazdaki geçici .wav dosyasını hemen sil
      try {
        const fileExists = await RNFS.exists(filePath);
        if (fileExists) {
          await RNFS.unlink(filePath);
          console.log('Yerel dosya temizlendi:', filePath);
        }
      } catch (cleanupErr) {
        console.error('Yerel dosya silinirken hata:', cleanupErr);
      }
    }
  };

  // Sessizlik sayacı dolunca RAM'deki chunk'ları WAV dosyasına döküp sunucuya iletir
  const finalizeRecording = async () => {
    try {
      const chunks = audioChunksRef.current;
      if (chunks.length === 0) {
        isRecordingRef.current = false;
        setIsRecordingSound(false);
        return;
      }

      const pcmData = Buffer.concat(chunks);
      const wavHeader = createWavHeader(pcmData.length);
      const completeWav = Buffer.concat([wavHeader, pcmData]);

      const filePath = `${RNFS.DocumentDirectoryPath}/uyku_kaydi_${Date.now()}.wav`;
      await RNFS.writeFile(filePath, completeWav.toString('base64'), 'base64');
      console.log('Kayıt bitti, sunucuya iletiliyor:', filePath);

      await sendToAI(filePath);
    } catch (err) {
      console.error('Kayıt sonlandırma hatası:', err);
    } finally {
      audioChunksRef.current = [];
      isRecordingRef.current = false;
      setIsRecordingSound(false);
    }
  };

  useEffect(() => {
    LiveAudioStream.init(options);

    LiveAudioStream.on('data', (data: string) => {
      const chunk = Buffer.from(data, 'base64');
      let sumSquares = 0;
      const count = chunk.length / 2;

      for (let i = 0; i < chunk.length; i += 2) {
        const sample = chunk.readInt16LE(i);
        sumSquares += sample * sample;
      }

      const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
      const db = rms > 0 ? 20 * Math.log10(rms) : 0;
      const finalDb = Math.max(0, db);
      setDbLevel(finalDb);

      // SES EŞİĞİ KONTROLÜ
      if (finalDb > THRESHOLD_DB) {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        if (!isRecordingRef.current) {
          isRecordingRef.current = true;
          setIsRecordingSound(true);
          audioChunksRef.current = [];
          console.log('Ses eşiği aşıldı (>40dB), ses RAM üzerinde toplanıyor...');
        }

        audioChunksRef.current.push(chunk);
      } else {
        if (isRecordingRef.current) {
          audioChunksRef.current.push(chunk);

          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              console.log('2 saniye sessizlik algılandı, ses AI analizine aktarılıyor...');
              finalizeRecording();
              silenceTimeoutRef.current = null;
            }, SILENCE_DELAY_MS);
          }
        }
      }
    });

    return () => {
      LiveAudioStream.stop();
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
    }
  };

  const startTracker = async () => {
    await requestPermissions();
    try {
      await BackgroundJob.start(() => new Promise(() => {}), bgOptions);
    } catch (e) {
      console.warn('BackgroundJob başlatma uyarısı:', e);
    }
    LiveAudioStream.start();
    setIsListening(true);
  };

  const stopTracker = async () => {
    LiveAudioStream.stop();
    try {
      await BackgroundJob.stop();
    } catch (e) {
      console.warn('BackgroundJob durdurma uyarısı:', e);
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (isRecordingRef.current) {
      await finalizeRecording();
    }
    setIsListening(false);
  };

  if (currentScreen === 'report') {
    return <SleepReportScreen onBack={() => setCurrentScreen('tracker')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>SleepTracker AI</Text>
        <TouchableOpacity
          style={styles.reportNavButton}
          onPress={() => setCurrentScreen('report')}>
          <Text style={styles.reportNavButtonText}>📊 Gece Raporu</Text>
        </TouchableOpacity>
      </View>

      {/* Sunucu URL Ayarı */}
      <View style={styles.serverBox}>
        <Text style={styles.serverLabel}>FastAPI Sunucu URL:</Text>
        <TextInput
          style={styles.serverInput}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.1.XX:8000"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Ses & Durum Kartı */}
      <View style={styles.card}>
        <Text style={styles.dbText}>
          Anlık Ses: <Text style={styles.dbValue}>{dbLevel.toFixed(1)} dB</Text>
        </Text>
        <Text
          style={[styles.statusBadge, isListening ? styles.activeBadge : styles.inactiveBadge]}>
          {isListening ? 'Mikrofon Dinleniyor' : 'Dinleme Kapalı'}
        </Text>
        {isRecordingSound && (
          <Text style={styles.recordingText}>🔴 Eşik aşıldı! RAM'de kaydediliyor...</Text>
        )}
      </View>

      <View style={styles.buttonWrapper}>
        <Button
          title={isListening ? 'Takibi Durdur' : 'Uyku Takibini Başlat'}
          color={isListening ? '#ef4444' : '#10b981'}
          onPress={isListening ? stopTracker : startTracker}
        />
      </View>

      {/* Yapay Zeka Sonuçları */}
      <View style={styles.logContainer}>
        <Text style={styles.logHeader}>Canlı Analiz Akışı</Text>
        <ScrollView style={styles.logScroll}>
          {analysisLogs.length === 0 ? (
            <Text style={styles.emptyText}>Henüz bir ses analizi yapılmadı.</Text>
          ) : (
            analysisLogs.map((log, index) => (
              <View key={index} style={styles.logItem}>
                <View style={styles.logRow}>
                  <Text style={styles.logType}>🔊 {log.type.toUpperCase()}</Text>
                  <Text style={styles.logTime}>{log.timestamp}</Text>
                </View>
                {log.confidence !== undefined && (
                  <Text style={styles.logDetail}>
                    Güven Oranı: %{(log.confidence * 100).toFixed(1)}
                  </Text>
                )}
                {log.text ? (
                  <Text style={styles.logText}>Metin: "{log.text}"</Text>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  reportNavButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  reportNavButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  serverBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  serverLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  serverInput: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    marginBottom: 12,
  },
  dbText: {
    fontSize: 20,
    color: '#94a3b8',
    marginBottom: 8,
  },
  dbValue: {
    fontWeight: 'bold',
    color: '#38bdf8',
  },
  statusBadge: {
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    overflow: 'hidden',
    fontWeight: '600',
  },
  activeBadge: {
    backgroundColor: '#065f46',
    color: '#34d399',
  },
  inactiveBadge: {
    backgroundColor: '#334155',
    color: '#94a3b8',
  },
  recordingText: {
    color: '#f87171',
    fontWeight: 'bold',
    marginTop: 8,
    fontSize: 14,
  },
  buttonWrapper: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 16,
  },
  logContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
  },
  logHeader: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logScroll: {
    flex: 1,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
  logItem: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logType: {
    color: '#38bdf8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  logTime: {
    color: '#64748b',
    fontSize: 11,
  },
  logDetail: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  logText: {
    color: '#fef08a',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
