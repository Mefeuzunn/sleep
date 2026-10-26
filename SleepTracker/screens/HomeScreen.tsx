import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  Text,
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
import notifee from '@notifee/react-native';
import { supabase } from '../supabase';
import AlarmScreen from '../AlarmScreen';
import { Colors } from '../theme';
import { PlayIcon, StopIcon } from '../components/Icons';
import LivePulseVisualizer from '../components/LivePulseVisualizer';

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
  color: Colors.primary,
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

  // Akıllı Alarm
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
      if (savedWindow) setWakeWindowMinutes(savedWindow);
      if (savedSound) setSelectedSoundName(savedSound);
      if (savedStatus) setIsAlarmEnabled(JSON.parse(savedStatus));
    } catch (e) {
      console.warn('AsyncStorage ayarları okunamadı:', e);
    }
  }, []);

  useEffect(() => {
    loadSavedSettings();
  }, [loadSavedSettings]);

  useEffect(() => {
    alarmSoundRef.current = new Sound('alarm_ringtone.mp3', Sound.MAIN_BUNDLE, error => {
      if (error) console.log('Özel alarm sesi yüklenemedi:', error);
    });

    return () => {
      if (alarmSoundRef.current) alarmSoundRef.current.release();
    };
  }, []);

  const triggerAlarm = async (reason: 'smart' | 'mandatory') => {
    if (alarmTriggeredRef.current) return;
    alarmTriggeredRef.current = true;

    if (Platform.OS === 'android') {
      if (NativeModules.WakeUp) {
        try {
          NativeModules.WakeUp.bringToFront();
        } catch (wakeErr) {
          console.warn('WakeUp native modül hatası:', wakeErr);
        }
      }
      setIsAlarmRinging(true);
      if (alarmSoundRef.current) {
        alarmSoundRef.current.setNumberOfLoops(-1);
        alarmSoundRef.current.play();
      }
    } else {
      try {
        await notifee.requestPermission();
        await notifee.displayNotification({
          title: reason === 'smart' ? '⏰ Günaydın Müge!' : '⏰ Alarm Saati!',
          body: 'Hafif uyku evrenizde uyandırıldınız. Raporunuzu görmek için dokunun.',
          ios: {
            sound: 'alarm_ringtone.wav',
            interruptionLevel: 'timeSensitive',
            critical: true,
            criticalVolume: 1.0,
            foregroundPresentationOptions: {
              badge: true,
              sound: true,
              banner: true,
              list: true,
            },
          },
        });
      } catch (iosNotifErr) {
        console.warn('iOS Bildirim hatası:', iosNotifErr);
      }
      setIsAlarmRinging(true);
    }
  };

  const handleStopAlarm = async () => {
    if (alarmSoundRef.current) alarmSoundRef.current.stop();
    setIsAlarmRinging(false);
    await stopTracker();
    if (navigation) navigation.navigate('Report');
  };

  const handleSnooze = (minutes: number = 10) => {
    if (alarmSoundRef.current) alarmSoundRef.current.stop();
    setIsAlarmRinging(false);
    alarmTriggeredRef.current = false;

    const currentM = alarmMinuteRef.current;
    const newTotalMinutes = alarmHourRef.current * 60 + currentM + minutes;
    const newH = Math.floor(newTotalMinutes / 60) % 24;
    const newMin = newTotalMinutes % 60;

    setAlarmHour(String(newH).padStart(2, '0'));
    setAlarmMinute(String(newMin).padStart(2, '0'));
  };

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
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const todaySession = new Date().toISOString().split('T')[0];
            await supabase.from('sleep_events').insert([
              {
                user_id: user.id,
                session_id: todaySession,
                event_type: type,
                transcript: text || null,
                confidence: confidence || null,
              },
            ]);
          }
        } catch (err) {
          console.error('Kayıt hatası:', err);
        }
      }
    } catch (error) {
      console.error('Yapay zeka analiz hatası:', error);
    } finally {
      try {
        const fileExists = await RNFS.exists(filePath);
        if (fileExists) await RNFS.unlink(filePath);
      } catch (cleanupErr) {
        console.error('Temizleme hatası:', cleanupErr);
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Canlı Nabız / Dalga Görselleştirici */}
        <View style={styles.heroSection}>
          <LivePulseVisualizer isListening={isListening} dbLevel={dbLevel} />
          <Text style={styles.heroStatusText}>
            {isListening ? 'UYKU İZLENİYOR' : 'TAKİP DURDURULDU'}
          </Text>
          <Text style={styles.heroSubText}>
            {isListening
              ? `${dbLevel.toFixed(1)} dB • ${movementCount} dönüş algılandı`
              : 'Seansı başlatmak için aşağıdaki butona dokunun'}
          </Text>
        </View>

        {/* Ana Eylem Butonu (44px+ dokunmatik hedef) */}
        <TouchableOpacity
          style={[styles.mainActionButton, isListening ? styles.stopActionButton : styles.startActionButton]}
          onPress={isListening ? stopTracker : startTracker}
          activeOpacity={0.85}>
          {isListening ? (
            <>
              <StopIcon size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Seansı Sonlandır</Text>
            </>
          ) : (
            <>
              <PlayIcon size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Uykuyu Başlat</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Akıllı Alarm Özet Kartı */}
        <View style={styles.glassCard}>
          <View style={styles.alarmHeaderRow}>
            <Text style={styles.cardHeaderTitle}>⏰ AKILLI UYANMA</Text>
            <Switch
              value={isAlarmEnabled}
              onValueChange={async val => {
                setIsAlarmEnabled(val);
                await AsyncStorage.setItem('isSmartAlarmActive', JSON.stringify(val));
              }}
              trackColor={{ false: '#334155', true: Colors.primary }}
              thumbColor={isAlarmEnabled ? Colors.primaryLight : '#94A3B8'}
            />
          </View>

          <TouchableOpacity
            style={styles.alarmSummaryBody}
            onPress={() => navigation?.navigate('Settings')}
            activeOpacity={0.7}>
            <View>
              <Text style={styles.alarmTimeDisplay}>
                {alarmHour}:{alarmMinute}
              </Text>
              <Text style={styles.alarmSubDetail}>
                {wakeWindowMinutes} dk uyanma penceresi • 🎵 {selectedSoundName}
              </Text>
            </View>
            <View style={styles.editPill}>
              <Text style={styles.editPillText}>Düzenle</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Canlı Biyometrik Sensör Kartı */}
        <View style={styles.glassCard}>
          <Text style={styles.cardHeaderTitle}>BİYOMETRİK VERİ AKIŞI</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Ses Seviyesi</Text>
              <Text style={[styles.metricValue, { color: Colors.accent }]}>{dbLevel.toFixed(1)} dB</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Yatak Hareketi</Text>
              <Text style={[styles.metricValue, { color: Colors.awake }]}>{movementCount}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Son Şiddet</Text>
              <Text style={[styles.metricValue, { color: Colors.remSleep }]}>{lastMovementIntensity.toFixed(1)}</Text>
            </View>
          </View>
        </View>

        {/* FastAPI Bulut Uç Noktası */}
        <View style={styles.serverCard}>
          <Text style={styles.serverCardLabel}>Yapay Zeka Sunucusu:</Text>
          <TextInput
            style={styles.serverInput}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://sleep-api.onrender.com"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Canlı Analiz Kayıtları */}
        {analysisLogs.length > 0 && (
          <View style={styles.glassCard}>
            <Text style={styles.cardHeaderTitle}>TESPİT EDİLEN SESLER</Text>
            {analysisLogs.slice(0, 3).map((log, idx) => (
              <View key={idx} style={styles.logItemRow}>
                <View style={styles.logItemLeft}>
                  <Text style={styles.logItemType}>
                    {log.type === 'snore' ? '🔴 Horlama' : log.type === 'speech' ? '🟡 Konuşma' : log.type === 'cough' ? '🟠 Öksürük' : '⚪ Ses'}
                  </Text>
                  {log.text ? <Text style={styles.logItemText}>"{log.text}"</Text> : null}
                </View>
                <Text style={styles.logItemTime}>{log.timestamp}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Tam Ekran Akıllı Alarm Modalı */}
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
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  heroStatusText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 1.5,
    marginTop: 8,
  },
  heroSubText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  mainActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 360,
    height: 56, // 44px+ touch standard
    borderRadius: 28,
    gap: 10,
    marginBottom: 20,
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  startActionButton: {
    backgroundColor: Colors.primary,
  },
  stopActionButton: {
    backgroundColor: Colors.snore,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  glassCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  alarmHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alarmSummaryBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  alarmTimeDisplay: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  alarmSubDetail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  editPill: {
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  editPillText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.borderSubtle,
  },
  serverCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  serverCardLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  serverInput: {
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  logItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  logItemLeft: {
    flex: 1,
  },
  logItemType: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  logItemText: {
    fontSize: 12,
    color: Colors.speech,
    fontStyle: 'italic',
    marginTop: 2,
  },
  logItemTime: {
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 8,
  },
});
