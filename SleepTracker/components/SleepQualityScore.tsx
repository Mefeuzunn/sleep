import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme';

interface SleepQualityScoreProps {
  score: number; // 0 - 100
  sleepDurationHours?: number;
  deepSleepPercent?: number;
}

export default function SleepQualityScore({
  score,
  sleepDurationHours = 7.5,
  deepSleepPercent = 22,
}: SleepQualityScoreProps) {
  const getScoreMeta = (val: number) => {
    if (val >= 85) return { label: 'Harika Uyku', color: Colors.deepSleep, bg: 'rgba(16, 185, 129, 0.12)' };
    if (val >= 70) return { label: 'İyi Dinlenme', color: Colors.accent, bg: 'rgba(56, 189, 248, 0.12)' };
    if (val >= 50) return { label: 'Orta Düzey', color: Colors.awake, bg: 'rgba(245, 158, 11, 0.12)' };
    return { label: 'Huzursuz Uyku', color: Colors.snore, bg: 'rgba(239, 68, 68, 0.12)' };
  };

  const meta = getScoreMeta(score);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.cardTitle}>UYKU KALİTE SKORU</Text>
          <Text style={[styles.statusBadge, { color: meta.color, backgroundColor: meta.bg }]}>
            {meta.label}
          </Text>
        </View>

        {/* Skor Dairesi */}
        <View style={[styles.scoreBadge, { borderColor: meta.color }]}>
          <Text style={[styles.scoreNumber, { color: meta.color }]}>{score}</Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>
      </View>

      {/* İlerleme Çubuğu */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${Math.min(score, 100)}%`, backgroundColor: meta.color }]} />
      </View>

      {/* Hızlı Biyometrik Dağılım */}
      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Süre</Text>
          <Text style={styles.statValue}>{sleepDurationHours.toFixed(1)} sa</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Derin Uyku</Text>
          <Text style={[styles.statValue, { color: Colors.deepSleep }]}>%{deepSleepPercent}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statLabel}>Hedef</Text>
          <Text style={styles.statValue}>8.0 sa</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  scoreBadge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  scoreMax: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: -3,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.borderSubtle,
  },
});
