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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNightData = async () => {
    setLoading(true);
    try {
      const todaySession = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('sleep_events')
        .select('*')
        .eq('session_id', todaySession)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase veri çekme hatası:', error);
      } else if (data) {
        setSpeechEvents(data.filter((e: SleepEvent) => e.event_type === 'speech'));
        setSnoreCount(data.filter((e: SleepEvent) => e.event_type === 'snore').length);
        setCoughCount(data.filter((e: SleepEvent) => e.event_type === 'cough').length);
      }
    } catch (err) {
      console.error('Rapor getirilirken hata:', err);
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

      {/* İstatistik Kartları */}
      <View style={styles.statsRow}>
        <View style={[styles.statsCard, styles.snoreCard]}>
          <Text style={styles.statNumber}>{snoreCount}</Text>
          <Text style={styles.statLabel}>Horlama</Text>
        </View>

        <View style={[styles.statsCard, styles.coughCard]}>
          <Text style={styles.statNumber}>{coughCount}</Text>
          <Text style={styles.statLabel}>Öksürük</Text>
        </View>

        <View style={[styles.statsCard, styles.speechSummaryCard]}>
          <Text style={styles.statNumber}>{speechEvents.length}</Text>
          <Text style={styles.statLabel}>Konuşma</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>Uykuda Söyledikleriniz:</Text>

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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  statsCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  snoreCard: {
    backgroundColor: '#7f1d1d',
  },
  coughCard: {
    backgroundColor: '#78350f',
  },
  speechSummaryCard: {
    backgroundColor: '#1e3a8a',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 18,
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
