import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { supabase } from './supabase';

export interface SleepEvent {
  id: string;
  session_id: string;
  event_type: 'snore' | 'speech' | 'cough' | string;
  transcript: string | null;
  confidence: number | null;
  created_at: string;
}

interface SleepReportScreenProps {
  onBack?: () => void;
}

export default function SleepReportScreen({ onBack }: SleepReportScreenProps) {
  const [speechEvents, setSpeechEvents] = useState<SleepEvent[]>([]);
  const [snoreCount, setSnoreCount] = useState(0);
  const [coughCount, setCoughCount] = useState(0);
  const [movementCount, setMovementCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Hareket ve ses kombinasyonundan uyku evresi tahmini
  const estimateSleepStage = () => {
    if (movementCount > 25) {
      return { stage: 'Hafif Uyku / Huzursuz', color: '#f59e0b', desc: 'Sık vücut dönüşleri ve hareketler kaydedildi.' };
    }
    if (movementCount < 6 && snoreCount < 5) {
      return { stage: 'Derin Uyku', color: '#10b981', desc: 'Vücut neredeyse tamamen hareketsiz ve dinlenme modunda.' };
    }
    return { stage: 'REM / Dengeli Uyku', color: '#6366f1', desc: 'Kas tonusu düşük, rüya ve zihinsel onarım evresi.' };
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
        .order('created_at', { ascending: false });

      if (eventError) {
        console.error('Supabase ses verisi çekme hatası:', eventError);
      } else if (eventData) {
        setSpeechEvents(eventData.filter((e: SleepEvent) => e.event_type === 'speech'));
        setSnoreCount(eventData.filter((e: SleepEvent) => e.event_type === 'snore').length);
        setCoughCount(eventData.filter((e: SleepEvent) => e.event_type === 'cough').length);
      }

      // 2. Hareket Verilerini Getir
      const { count: moveCount, error: moveError } = await supabase
        .from('sleep_movements')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', todaySession);

      if (moveError) {
        console.warn('Supabase hareket verisi çekme uyarısı:', moveError.message);
      } else if (moveCount !== null) {
        setMovementCount(moveCount);
      }
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

      {/* Uyku Evresi Tahmin Kartı */}
      <View style={[styles.stageCard, { borderColor: currentSleepStage.color }]}>
        <Text style={styles.stageTitle}>Tahmini Uyku Evresi:</Text>
        <Text style={[styles.stageName, { color: currentSleepStage.color }]}>
          {currentSleepStage.stage}
        </Text>
        <Text style={styles.stageDesc}>{currentSleepStage.desc}</Text>
      </View>

      {/* İstatistik Kartları */}
      <View style={styles.statsRow}>
        <View style={[styles.statsCard, styles.movementCard]}>
          <Text style={styles.statNumber}>{movementCount}</Text>
          <Text style={styles.statLabel}>Hareket / Dönüş</Text>
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
        <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={speechEvents}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38bdf8"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                Bu gece kaydedilen konuşma bulunamadı.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.speechCard}>
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
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
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
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
  },
});
