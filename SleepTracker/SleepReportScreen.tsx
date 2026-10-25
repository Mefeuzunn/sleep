import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { supabase } from './supabase';
import HypnogramChart, { HypnogramDataPoint } from './HypnogramChart';
import { processSleepData, RawMovement, RawAudioEvent } from './sleepProcessor';

interface SleepReportScreenProps {
  onBack?: () => void;
}

export default function SleepReportScreen({ onBack }: SleepReportScreenProps) {
  const [speechEvents, setSpeechEvents] = useState<RawAudioEvent[]>([]);
  const [snoreCount, setSnoreCount] = useState(0);
  const [coughCount, setCoughCount] = useState(0);
  const [movementCount, setMovementCount] = useState(0);
  const [hypnogramData, setHypnogramData] = useState<HypnogramDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const estimateSleepStage = () => {
    if (movementCount > 25) {
      return { stage: 'Hafif Uyku / Huzursuz', color: '#f59e0b', desc: 'Sık vücut dönüşleri ve hareketler kaydedildi.' };
    }
    if (movementCount < 6 && snoreCount < 5) {
      return { stage: 'Derin Uyku', color: '#10b981', desc: 'Vücut neredeyse tamamen hareketsiz ve dinlenme modunda.' };
    }
    return { stage: 'REM / Dengeli Uyku', color: '#6366f1', desc: 'Düşük kas aktivitesi, rüya ve zihinsel onarım evresi.' };
  };

  const fetchNightData = async () => {
    setLoading(true);
    try {
      const todaySession = new Date().toISOString().split('T')[0];

      // 1. Ses Olaylarını Getir
      const { data: eventData, error: eventError } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('session_id', todaySession)
        .order('created_at', { ascending: true });

      let loadedEvents: RawAudioEvent[] = [];
      if (eventError) {
        console.error('Supabase ses verisi çekme hatası:', eventError);
      } else if (eventData) {
        loadedEvents = eventData;
        setSpeechEvents(eventData.filter((e: RawAudioEvent) => e.event_type === 'speech'));
        setSnoreCount(eventData.filter((e: RawAudioEvent) => e.event_type === 'snore').length);
        setCoughCount(eventData.filter((e: RawAudioEvent) => e.event_type === 'cough').length);
      }

      // 2. Hareket Verilerini Getir
      const { data: moveData, error: moveError } = await supabase
        .from('sleep_movements')
        .select('*')
        .eq('session_id', todaySession)
        .order('created_at', { ascending: true });

      let loadedMovements: RawMovement[] = [];
      if (moveError) {
        console.warn('Supabase hareket verisi çekme uyarısı:', moveError.message);
      } else if (moveData) {
        loadedMovements = moveData;
        setMovementCount(moveData.length);
      }

      // 3. 15 Dakikalık (Epoch) Gruplama Algoritması ile Hipnogram Grafiği Üret
      const calculatedChart = processSleepData(loadedMovements, loadedEvents);
      setHypnogramData(calculatedChart);
    } catch (err) {
      console.error('Rapor yüklenirken hata:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNightData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNightData();
  };

  const currentSleepStage = estimateSleepStage();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Geri</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Gece Raporu</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#38bdf8"
          />
        }>
        {/* 15 Dakikalık Epoch Hipnogram Uyku Döngüsü Grafiği */}
        <HypnogramChart data={hypnogramData} />

        {/* Uyku Evresi Tahmin Kartı */}
        <View style={[styles.stageCard, { borderColor: currentSleepStage.color }]}>
          <Text style={styles.stageTitle}>Genel Uyku Durumu:</Text>
          <Text style={[styles.stageName, { color: currentSleepStage.color }]}>
            {currentSleepStage.stage}
          </Text>
          <Text style={styles.stageDesc}>{currentSleepStage.desc}</Text>
        </View>

        {/* İstatistik Kartları */}
        <View style={styles.statsRow}>
          <View style={[styles.statsCard, styles.movementCard]}>
            <Text style={styles.statNumber}>{movementCount}</Text>
            <Text style={styles.statLabel}>Dönüş / Hareket</Text>
          </View>

          <View style={[styles.statsCard, styles.snoreCard]}>
            <Text style={styles.statNumber}>{snoreCount}</Text>
            <Text style={styles.statLabel}>Horlama</Text>
          </View>

          <View style={[styles.statsCard, styles.coughCard]}>
            <Text style={styles.statNumber}>{coughCount}</Text>
            <Text style={styles.statLabel}>Öksürük</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>Uykuda Söyledikleriniz ({speechEvents.length}):</Text>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 20 }} />
        ) : speechEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Bu gece kaydedilen konuşma bulunamadı.</Text>
          </View>
        ) : (
          speechEvents.map((item, idx) => (
            <View key={item.id || idx} style={styles.speechCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.time}>
                  {new Date(item.created_at).toLocaleTimeString('tr-TR')}
                </Text>
                {item.confidence && (
                  <Text style={styles.confidence}>
                    %{(item.confidence * 100).toFixed(0)} güven
                  </Text>
                )}
              </View>
              <Text style={styles.transcript}>"{item.transcript || '(Metin yok)'}"</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    marginRight: 12,
  },
  backButtonText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  stageCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
  },
  stageTitle: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  stageName: {
    fontSize: 19,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  stageDesc: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  statsCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
  },
  movementCard: {
    backgroundColor: '#78350f',
  },
  snoreCard: {
    backgroundColor: '#7f1d1d',
  },
  coughCard: {
    backgroundColor: '#374151',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 12,
  },
  speechCard: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#38bdf8',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  time: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  confidence: {
    fontSize: 11,
    color: '#34d399',
    fontWeight: '600',
  },
  transcript: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#f8fafc',
    lineHeight: 22,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
  },
});
