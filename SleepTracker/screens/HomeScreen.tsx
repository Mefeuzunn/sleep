import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Switch,
  NativeModules,
  TouchableOpacity,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import AlarmScreen from '../AlarmScreen';

Sound.setCategory('Playback', true);
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
  taskDesc: 'Uyanma penceresi ve uyku sesleri izleniyor...',
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

interface HomeScreenProps {
  navigation?: any;
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
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
  const [selectedSoundName, setSelectedSoundName] = useState('Kuş Sesleri');
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

  // AsyncStorage Ayarlarını Yükleme
  const loadSavedSettings = useCallback(async () => {
    try {
      const savedTime = await AsyncStorage.getItem('alarmTime');
      const savedWindow = await AsyncStorage.getItem('wakeWindow');
      const savedSound = await AsyncStorage.getItem('selectedSound');
      const savedStatus = await AsyncStorage.getItem('isSmartAlarmActive');

      if (savedTime) {
        const d = new Date(savedTime);
        setAlarmHour(String(d.getHours()).padStart(2, '0'));
        setAlarmMinute(String(d.getMinutes()).padStart(2, '0'));
      }
      if (savedWindow) {
        setWakeWindowMinutes(savedWindow);
      }
      if (savedSound) {
        setSelectedSoundName(savedSound);
      }
      if (savedStatus) {
        setIsAlarmEnabled(JSON.parse(savedStatus));
      }
    } catch (e) {
      console.warn('AsyncStorage ayarları okunamadı:', e);
    }
  }, []);

  useEffect(() => {
    loadSavedSettings();
  }, [loadSavedSettings]);

  // Alarm Sesi
  useEffect(() => {
    alarmSoundRef.current = new Sound('alarm_ringtone.mp3', Sound.MAIN_BUNDLE, error => {
      if (error) {
        console.log('Özel alarm sesi yüklenemedi:', error);
      }
    });

    return () => {
      if (alarmSoundRef.current) {
        alarmSoundRef.current.release();
      }
    };
  }, []);

  // Alarm Tetikleme
  const triggerAlarm = (reason: 'smart' | 'mandatory') => {
    if (alarmTriggeredRef.current) return;
    alarmTriggeredRef.current = true;

    if (Platform.OS === 'android' && NativeModules.WakeUp) {
      try {
        NativeModules.WakeUp.bringToFront();
      } catch (wakeErr) {
        console.warn('WakeUp native modül hatası:', wakeErr);
      }
    }

    setIsAlarmRinging(true);
    console.log(
      reason === 'smart'
        ? '💡 Hafif uyku evresi yakalandı! Akıllı alarm çalıyor!'
        : '⏰ Son saat geldi! Mecburi alarm çalıyor!',
    );

    if (alarmSoundRef.current) {
      alarmSoundRef.current.setNumberOfLoops(-1);
      alarmSoundRef.current.play();
    }
  };

  const handleStopAlarm = async () => {
    if (alarmSoundRef.current) {
      alarmSoundRef.current.stop();
    }
    setIsAlarmRinging(false);
    await stopTracker();
    if (navigation) {
      navigation.navigate('Report');
    }
  };

  const handleSnooze = (minutes: number = 10) => {
    if (alarmSoundRef.current) {
      alarmSoundRef.current.stop();
    }
    setIsAlarmRinging(false);
    alarmTriggeredRef.current = false;

    const currentM = alarmMinuteRef.current;
    const newTotalMinutes = alarmHourRef.current * 60 + currentM + minutes;
    const newH = Math.floor(newTotalMinutes / 60) % 24;
    const newMin = newTotalMinutes % 60;

    setAlarmHour(String(newH).padStart(2, '0'));
    setAlarmMinute(String(newMin).padStart(2, '0'));
  };

  // İvmeölçer & Akıllı Alarm Zaman Kontrolü
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      subscription = accelerometer.subscribe(({ x, y, z }) => {
        if (!isListeningRef.current) return;

        const totalForce = Math.sqrt(x * x + y * y + z * z);
        const netMovement = Math.abs(totalForce - 9.81);

        if (isAlarmEnabledRef.current && !alarmTriggeredRef.current) {
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();

          const targetTimeInMinutes = alarmHourRef.current * 60 + alarmMinuteRef.current;
          const currentTimeInMinutes = currentHour * 60 + currentMinute;

          const windowStart = targetTimeInMinutes - wakeWindowRef.current;
          const windowEnd = targetTimeInMinutes;

          if (currentTimeInMinutes >= windowStart && currentTimeInMinutes < windowEnd) {
            if (netMovement > MOVEMENT_THRESHOLD) {
              triggerAlarm('smart');
              return;
            }
          } else if (currentTimeInMinutes >= windowEnd) {
            triggerAlarm('mandatory');
            return;
          }
        }

        if (netMovement > MOVEMENT_THRESHOLD) {
          setLastMovementIntensity(netMovement);
          setMovementCount(prev => prev + 1);

          const todaySession = new Date().toISOString().split('T')[0];
          supabase.auth.getUser().then(({ data: { user } }) => {
            supabase
              .from('sleep_movements')
              .insert([
                {
                  user_id: user?.id,
                  session_id: todaySession,
                  intensity: Number(netMovement.toFixed(2)),
                },
              ])
              .then(({ error }) => {
                if (error) console.warn('Hareket kaydı uyarısı:', error.message);
              });
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
        try {
          // 1. Aktif kullanıcının güvenli oturum bilgisini (UUID) al
          const { data: { user }, error: userError } = await supabase.auth.getUser();

          if (userError || !user) {
            console.error('Kullanıcı bulunamadı, oturum düşmüş olabilir:', userError);
            return;
          }

          const todaySession = new Date().toISOString().split('T')[0]; // Örn: 2026-10-25

          // 2. user_id alanını ekleyerek kaydı gerçekleştir
          const { error: insertError } = await supabase.from('sleep_events').insert([
            {
              user_id: user.id, // RLS politikasını geçmek için zorunlu alan
              session_id: todaySession,
              event_type: type,
              transcript: text || null,
              confidence: confidence || null,
            },
          ]);

          if (insertError) {
            console.error('Supabase RLS veya kayıt hatası:', insertError.message);
          } else {
            console.log('Olay kullanıcının hesabına başarıyla kaydedildi:', type);
          }
        } catch (err) {
          console.error('Veritabanı işlemi sırasında beklenmeyen hata:', err);
        }
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Akıllı Alarm Özet Kartı */}
      <View style={styles.alarmCard}>
        <View style={styles.alarmHeaderRow}>
          <Text style={styles.alarmCardTitle}>⏰ Akıllı Alarm</Text>
          <Switch
            value={isAlarmEnabled}
            onValueChange={async val => {
              setIsAlarmEnabled(val);
              await AsyncStorage.setItem('isSmartAlarmActive', JSON.stringify(val));
            }}
            trackColor={{ false: '#334155', true: '#38bdf8' }}
            thumbColor={isAlarmEnabled ? '#0284c7' : '#94a3b8'}
          />
        </View>

        <TouchableOpacity
          style={styles.alarmTouchableSummary}
          onPress={() => navigation?.navigate('Settings')}>
          <View style={styles.alarmSummaryLeft}>
            <Text style={styles.alarmTimeBig}>
              {alarmHour}:{alarmMinute}
            </Text>
            <Text style={styles.alarmSoundLabel}>🎵 {selectedSoundName}</Text>
          </View>
          <View style={styles.alarmSummaryRight}>
            <Text style={styles.alarmWindowBadge}>
              {wakeWindowMinutes} dk pencere
            </Text>
            <Text style={styles.editAlarmText}>Ayarları Düzenle ›</Text>
          </View>
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

      {/* Full-Screen Alarm Modal Ekranı */}
      <AlarmScreen
        isRinging={isAlarmRinging}
        onStopAlarm={handleStopAlarm}
        onSnooze={handleSnooze}
      />
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
  alarmTouchableSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  alarmSummaryLeft: {
    flexDirection: 'column',
  },
  alarmTimeBig: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#f8fafc',
    letterSpacing: 1,
  },
  alarmSoundLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  alarmSummaryRight: {
    alignItems: 'flex-end',
  },
  alarmWindowBadge: {
    backgroundColor: '#0369a1',
    color: '#e0f2fe',
    fontSize: 11,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    fontWeight: '600',
    overflow: 'hidden',
  },
  editAlarmText: {
    color: '#38bdf8',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
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
