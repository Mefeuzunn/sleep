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
  Switch,
  Alert,
} from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import BackgroundJob from 'react-native-background-actions';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import axios from 'axios';
import {
  accelerometer,
  setUpdateIntervalForType,
  SensorTypes,
} from 'react-native-sensors';
import Sound from 'react-native-sound';
import { supabase } from './supabase';
import SleepReportScreen from './SleepReportScreen';

// react-native-sound ses kategorisi ayarı (sessiz modda bile çalsın)
Sound.setCategory('Playback', true);

// Sensör okuma sıklığı: 1000 ms (1 saniye)
setUpdateIntervalForType(SensorTypes.accelerometer, 1000);

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const THRESHOLD_DB = 40;
const SILENCE_DELAY_MS = 2000;
const MOVEMENT_THRESHOLD = 0.5;

const options = {
  sampleRate: SAMPLE_RATE,
  channels: CHANNELS,
  bitsPerSample: BITS_PER_SAMPLE,
  audioSource: 6,
  bufferSize: 4096,
  wavFile: 'temp_stream.wav',
};

const bgOptions = {
  taskName: 'SleepTracker',
  taskTitle: 'Uyku Takibi & Akıllı Alarm Aktif',
  taskDesc: 'Uyanma penceresi ve uyku hareketleri izleniyor...',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  color: '#6200ee',
  parameters: { delay: 1000 },
};

const createWavHeader = (dataLength: number) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(dataLength + 36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
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
  const [serverUrl, setServerUrl] = useState('http://10.0.2.2:8000');
  const [dbLevel, setDbLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isRecordingSound, setIsRecordingSound] = useState(false);
  const [movementCount, setMovementCount] = useState(0);
  const [lastMovementIntensity, setLastMovementIntensity] = useState(0);
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisResult[]>([]);

  // Akıllı Alarm State'leri
  const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
  const [alarmHour, setAlarmHour] = useState('07');
  const [alarmMinute, setAlarmMinute] = useState('30');
  const [wakeWindowMinutes, setWakeWindowMinutes] = useState('30');
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);

  // Referanslar
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const isListeningRef = useRef(false);
  isListeningRef.current = isListening;

  const isAlarmEnabledRef = useRef(isAlarmEnabled);
  isAlarmEnabledRef.current = isAlarmEnabled;

  const alarmHourRef = useRef(parseInt(alarmHour, 10) || 7);
  alarmHourRef.current = parseInt(alarmHour, 10) || 7;

  const alarmMinuteRef = useRef(parseInt(alarmMinute, 10) || 30);
  alarmMinuteRef.current = parseInt(alarmMinute, 10) || 30;

  const wakeWindowRef = useRef(parseInt(wakeWindowMinutes, 10) || 30);
  wakeWindowRef.current = parseInt(wakeWindowMinutes, 10) || 30;

  const alarmTriggeredRef = useRef(false);
  const alarmSoundRef = useRef<Sound | null>(null);

  const isRecordingRef = useRef(false);
  const audioChunksRef = useRef<Buffer[]>([]);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alarm Sesini Hazırlama
  useEffect(() => {
    // Projede alarm_ringtone.mp3 veya sistem default zil sesi kullanılabilir
    alarmSoundRef.current = new Sound('alarm_ringtone.mp3', Sound.MAIN_BUNDLE, error => {
      if (error) {
        console.log('Özel alarm sesi bulunamadı, fallback yapılandırılıyor:', error);
      }
    });

    return () => {
      if (alarmSoundRef.current) {
        alarmSoundRef.current.release();
      }
    };
  }, []);

  // Alarmı Tetikleme
  const triggerAlarm = (reason: 'smart' | 'mandatory') => {
    if (alarmTriggeredRef.current) return;
    alarmTriggeredRef.current = true;
    setIsAlarmRinging(true);

    console.log(
      reason === 'smart'
        ? '💡 Hafif uyku evresi yakalandı! Akıllı alarm çalıyor!'
        : '⏰ Son saat geldi! Mecburi alarm çalıyor!',
    );

    if (alarmSoundRef.current) {
      alarmSoundRef.current.setNumberOfLoops(-1); // Kapatılana kadar tekrar et
      alarmSoundRef.current.play(success => {
        if (!success) {
          console.log('Ses çalma başarısız oldu');
        }
      });
    }

    Alert.alert(
      reason === 'smart' ? '🌅 Günaydın! (Akıllı Uyanış)' : '⏰ Alarm Saati!',
      reason === 'smart'
        ? 'Hafif uyku evresindeyken uyandınız, sersemlik hissetmeyeceksiniz.'
        : 'Hedeflenen uyanma saatine ulaşıldı.',
      [{ text: 'Alarmı Kapat', onPress: dismissAlarm }],
      { cancelable: false },
    );
  };

  // Alarmı ve Takibi Kapatma
  const dismissAlarm = async () => {
    if (alarmSoundRef.current) {
      alarmSoundRef.current.stop();
    }
    setIsAlarmRinging(false);
    await stopTracker();
    console.log('Alarm kapatıldı, uyku takibi sonlandırıldı.');
  };

  // İvmeölçer Sensör Dinleyicisi & Akıllı Alarm Zaman Kontrolü
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      subscription = accelerometer.subscribe(({ x, y, z }) => {
        if (!isListeningRef.current) return;

        // Vektörel net hareket büyüklüğü: |sqrt(x² + y² + z²) - 9.81|
        const totalForce = Math.sqrt(x * x + y * y + z * z);
        const netMovement = Math.abs(totalForce - 9.81);

        // 1. Akıllı Alarm Kontrolü
        if (isAlarmEnabledRef.current && !alarmTriggeredRef.current) {
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();

          const targetTimeInMinutes = alarmHourRef.current * 60 + alarmMinuteRef.current;
          const currentTimeInMinutes = currentHour * 60 + currentMinute;

          const windowStart = targetTimeInMinutes - wakeWindowRef.current;
          const windowEnd = targetTimeInMinutes;

          // DURUM 1: Uyanma penceresindeyiz ve hareket algılandı (Hafif Uyku)
          if (currentTimeInMinutes >= windowStart && currentTimeInMinutes < windowEnd) {
            if (netMovement > MOVEMENT_THRESHOLD) {
              triggerAlarm('smart');
              return;
            }
          }
          // DURUM 2: Pencere süresi doldu, mecburi alarm saati
          else if (currentTimeInMinutes >= windowEnd) {
            triggerAlarm('mandatory');
            return;
          }
        }

        // 2. Yatak Dönüş Hareketi Kaydı
        if (netMovement > MOVEMENT_THRESHOLD) {
          setLastMovementIntensity(netMovement);
          setMovementCount(prev => prev + 1);

          const todaySession = new Date().toISOString().split('T')[0];
          supabase
            .from('sleep_movements')
            .insert([
              {
                session_id: todaySession,
                intensity: Number(netMovement.toFixed(2)),
              },
            ])
            .then(({ error }) => {
              if (error) console.warn('Hareket kaydı uyarısı:', error.message);
            });
        }
      });
    } catch (err) {
      console.warn('İvmeölçer hatası:', err);
    }

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const sendToAI = async (filePath: string) => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? `file://${filePath}` : filePath,
        name: 'sleep_audio.wav',
        type: 'audio/wav',
      } as unknown as Blob);

      const response = await axios.post(`${serverUrlRef.current}/analyze-audio`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 15000,
      });

      const { type, confidence, text } = response.data;
      const newResult: AnalysisResult = {
        type: type || 'Bilinmiyor',
        confidence: confidence,
        text: text,
        timestamp: new Date().toLocaleTimeString(),
      };
      setAnalysisLogs(prev => [newResult, ...prev.slice(0, 9)]);

      if (type !== 'noise' && type !== 'unknown') {
        const todaySession = new Date().toISOString().split('T')[0];
        await supabase.from('sleep_events').insert([
          {
            session_id: todaySession,
            event_type: type,
            transcript: text || null,
            confidence: confidence || null,
          },
        ]);
      }
    } catch (error) {
      console.error('Yapay zekaya gönderim hatası:', error);
    } finally {
      try {
        const fileExists = await RNFS.exists(filePath);
        if (fileExists) await RNFS.unlink(filePath);
      } catch (cleanupErr) {
        console.error('Yerel dosya temizleme hatası:', cleanupErr);
      }
    }
  };

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

      if (finalDb > THRESHOLD_DB) {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        if (!isRecordingRef.current) {
          isRecordingRef.current = true;
          setIsRecordingSound(true);
          audioChunksRef.current = [];
        }

        audioChunksRef.current.push(chunk);
      } else {
        if (isRecordingRef.current) {
          audioChunksRef.current.push(chunk);

          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              finalizeRecording();
              silenceTimeoutRef.current = null;
            }, SILENCE_DELAY_MS);
          }
        }
      }
    });

    return () => {
      LiveAudioStream.stop();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
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
    alarmTriggeredRef.current = false;
    setIsAlarmRinging(false);
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

      {/* Alarm Çalma Bildirimi (Banner) */}
      {isAlarmRinging && (
        <View style={styles.alarmBanner}>
          <Text style={styles.alarmBannerText}>⏰ ALARM ÇALIYOR! GÜNAYDIN ☀️</Text>
          <TouchableOpacity style={styles.dismissButton} onPress={dismissAlarm}>
            <Text style={styles.dismissButtonText}>Alarmı Durdur</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Akıllı Alarm Ayar Kartı */}
      <View style={styles.alarmCard}>
        <View style={styles.alarmHeaderRow}>
          <Text style={styles.alarmCardTitle}>⏰ Akıllı Alarm (Smart Wake-Up)</Text>
          <Switch
            value={isAlarmEnabled}
            onValueChange={setIsAlarmEnabled}
            trackColor={{ false: '#334155', true: '#38bdf8' }}
            thumbColor={isAlarmEnabled ? '#0284c7' : '#94a3b8'}
          />
        </View>

        <View style={styles.alarmInputRow}>
          <View style={styles.timeGroup}>
            <Text style={styles.inputLabel}>Hedef Saat</Text>
            <View style={styles.timeInputs}>
              <TextInput
                style={styles.timeInput}
                value={alarmHour}
                onChangeText={setAlarmHour}
                keyboardType="numeric"
                maxLength={2}
                placeholder="07"
                placeholderTextColor="#64748b"
              />
              <Text style={styles.colon}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={alarmMinute}
                onChangeText={setAlarmMinute}
                keyboardType="numeric"
                maxLength={2}
                placeholder="30"
                placeholderTextColor="#64748b"
              />
            </View>
          </View>

          <View style={styles.windowGroup}>
            <Text style={styles.inputLabel}>Uyanma Penceresi</Text>
            <View style={styles.windowInputWrap}>
              <TextInput
                style={styles.windowInput}
                value={wakeWindowMinutes}
                onChangeText={setWakeWindowMinutes}
                keyboardType="numeric"
                maxLength={2}
                placeholder="30"
                placeholderTextColor="#64748b"
              />
              <Text style={styles.windowUnit}>dk önce</Text>
            </View>
          </View>
        </View>

        <Text style={styles.alarmHint}>
          💡 {alarmHour}:{alarmMinute}'den {wakeWindowMinutes} dakika önce ilk hafif uyku hareketinde çalar.
        </Text>
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

      {/* Ses & Hareket Durum Kartı */}
      <View style={styles.card}>
        <View style={styles.sensorRow}>
          <View style={styles.sensorItem}>
            <Text style={styles.sensorLabel}>Anlık Ses</Text>
            <Text style={styles.sensorValue}>{dbLevel.toFixed(1)} dB</Text>
          </View>
          <View style={styles.sensorDivider} />
          <View style={styles.sensorItem}>
            <Text style={styles.sensorLabel}>Yatak Hareketi</Text>
            <Text style={styles.movementValue}>{movementCount} kez</Text>
          </View>
        </View>

        {lastMovementIntensity > 0 && isListening && (
          <Text style={styles.movementHint}>
            Son Hareket Şiddeti: {lastMovementIntensity.toFixed(2)} m/s²
          </Text>
        )}

        <View style={styles.badgeContainer}>
          <Text
            style={[
              styles.statusBadge,
              isListening ? styles.activeBadge : styles.inactiveBadge,
            ]}>
            {isListening ? 'Mikrofon & İvmeölçer Aktif' : 'Takip Kapalı'}
          </Text>
        </View>

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

      {/* Canlı Yapay Zeka Akışı */}
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
    marginVertical: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  reportNavButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  reportNavButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  alarmBanner: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#dc2626',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  alarmBannerText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 8,
  },
  dismissButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  dismissButtonText: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: 13,
  },
  alarmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  alarmHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  alarmCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#38bdf8',
  },
  alarmInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timeGroup: {
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInput: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 44,
    borderWidth: 1,
    borderColor: '#334155',
  },
  colon: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 4,
  },
  windowGroup: {
    alignItems: 'center',
  },
  windowInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  windowInput: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 44,
    borderWidth: 1,
    borderColor: '#334155',
  },
  windowUnit: {
    color: '#94a3b8',
    fontSize: 12,
    marginLeft: 6,
  },
  alarmHint: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 4,
  },
  serverBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  serverLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  serverInput: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    marginBottom: 10,
  },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 8,
  },
  sensorItem: {
    alignItems: 'center',
    flex: 1,
  },
  sensorLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 2,
  },
  sensorValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#38bdf8',
  },
  movementValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f59e0b',
  },
  movementHint: {
    color: '#fbbf24',
    fontSize: 10,
    marginBottom: 6,
  },
  sensorDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#334155',
  },
  badgeContainer: {
    marginTop: 2,
  },
  statusBadge: {
    fontSize: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 6,
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
    marginTop: 6,
    fontSize: 13,
  },
  buttonWrapper: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 12,
  },
  logContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
  },
  logHeader: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  logScroll: {
    flex: 1,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  logItem: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
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
    fontSize: 12,
  },
  logTime: {
    color: '#64748b',
    fontSize: 10,
  },
  logDetail: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 3,
  },
  logText: {
    color: '#fef08a',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 3,
  },
});
