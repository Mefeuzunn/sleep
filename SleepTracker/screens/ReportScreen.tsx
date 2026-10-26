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
import { supabase } from '../supabase';
import HypnogramChart, { HypnogramDataPoint } from '../HypnogramChart';
import { processSleepData, RawMovement, RawAudioEvent } from '../sleepProcessor';
import { Colors } from '../theme';
import SleepQualityScore from '../components/SleepQualityScore';

interface ReportScreenProps {
  onBack?: () => void;
}

export default function ReportScreen({ onBack }: ReportScreenProps) {
  const [speechEvents, setSpeechEvents] = useState<RawAudioEvent[]>([]);
  const [snoreCount, setSnoreCount] = useState(0);
  const [coughCount, setCoughCount] = useState(0);
  const [movementCount, setMovementCount] = useState(0);
  const [hypnogramData, setHypnogramData] = useState<HypnogramDataPoint[]>([]);
  const [sleepScore, setSleepScore] = useState(84);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Uyku Kalite Skoru Hesaplama Motoru (0 - 100)
  const calculateSleepScore = (moves: number, snores: number, coughs: number, epochsCount: number) => {
    let score = 90; // Başlangıç baz puanı

    // Hareket / Dönüş cezası (Her aşırı hareket -0.5 puan)
    if (moves > 10) {
      score -= Math.min((moves - 10) * 0.4, 25);
    }

    // Horlama cezası
    if (snores > 0) {
      score -= Math.min(snores * 1.5, 20);
    }

    // Öksürük cezası
    if (coughs > 0) {
      score -= Math.min(coughs * 2.0, 15);
    }

    // Seans uzunluğu bonusu
    if (epochsCount >= 20) {
      score += 10;
    }

    return Math.max(Math.min(Math.round(score), 100), 20);
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
      let currentSnores = 0;
      let currentCoughs = 0;
      if (!eventError && eventData) {
        loadedEvents = eventData;
        currentSnores = eventData.filter((e: RawAudioEvent) => e.event_type === 'snore').length;
        currentCoughs = eventData.filter((e: RawAudioEvent) => e.event_type === 'cough').length;
        setSpeechEvents(eventData.filter((e: RawAudioEvent) => e.event_type === 'speech'));
        setSnoreCount(currentSnores);
        setCoughCount(currentCoughs);
      }

      // 2. Hareket Verilerini Getir
      const { data: moveData, error: moveError } = await supabase
        .from('sleep_movements')
        .select('*')
        .eq('session_id', todaySession)
        .order('created_at', { ascending: true });

      let loadedMovements: RawMovement[] = [];
      let currentMoves = 0;
      if (!moveError && moveData) {
        loadedMovements = moveData;
        currentMoves = moveData.length;
        setMovementCount(currentMoves);
      }

      // 3. 15 Dakikalık (Epoch) Gruplama Algoritması
      const calculatedChart = processSleepData(loadedMovements, loadedEvents);
      setHypnogramData(calculatedChart);

      // 4. Skor Hesabı
      const dynamicScore = calculateSleepScore(currentMoves, currentSnores, currentCoughs, calculatedChart.length);
      setSleepScore(dynamicScore);
    } catch (err) {
      console.error('Rapor yükleme hatası:', err);
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }>
        {/* Başlık */}
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Geri</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Gece Analizi</Text>
        </View>

        {/* 1. Uyku Kalite Skoru Kartı */}
        <SleepQualityScore score={sleepScore} />

        {/* 2. Hipnogram Uyku Döngüsü Grafiği */}
        <HypnogramChart data={hypnogramData} />

        {/* 3. Biyometrik İstatistik Kartları */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { borderColor: Colors.borderSubtle }]}>
            <Text style={styles.statBoxValue}>{movementCount}</Text>
            <Text style={styles.statBoxLabel}>Dönüş</Text>
          </View>
          <View style={[styles.statBox, { borderColor: Colors.borderSubtle }]}>
            <Text style={[styles.statBoxValue, { color: Colors.snore }]}>{snoreCount}</Text>
            <Text style={styles.statBoxLabel}>Horlama</Text>
          </View>
          <View style={[styles.statBox, { borderColor: Colors.borderSubtle }]}>
            <Text style={[styles.statBoxValue, { color: Colors.cough }]}>{coughCount}</Text>
            <Text style={styles.statBoxLabel}>Öksürük</Text>
          </View>
        </View>

        {/* 4. Konuşma Çözümleri */}
        <Text style={styles.sectionHeader}>Uykuda Konuşmalar ({speechEvents.length})</Text>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 20 }} />
        ) : speechEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Bu gece konuşma veya fısıltı kaydedilmedi.</Text>
          </View>
        ) : (
          speechEvents.map((item, idx) => (
            <View key={item.id || idx} style={styles.speechCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.timeText}>
                  {new Date(item.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                {item.confidence && (
                  <Text style={styles.confidenceBadge}>
                    %{(item.confidence * 100).toFixed(0)} güven
                  </Text>
                )}
              </View>
              <Text style={styles.transcriptText}>"{item.transcript || '(Metin çözümlenemedi)'}"</Text>
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
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    marginRight: 12,
  },
  backButtonText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  statBoxValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statBoxLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    fontWeight: '500',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  speechCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.speech,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  confidenceBadge: {
    fontSize: 11,
    color: Colors.deepSleep,
    fontWeight: '600',
  },
  transcriptText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  emptyContainer: {
    padding: 24,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
});
