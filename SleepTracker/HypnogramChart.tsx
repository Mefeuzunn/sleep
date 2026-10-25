import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

export interface HypnogramDataPoint {
  value: number; // 0: Derin, 1: REM, 2: Hafif, 3: Uyanık
  label: string;
  showDataPoint?: boolean;
  dataPointColor?: string;
  dataPointText?: string;
  textColor?: string;
  textFontSize?: number;
}

interface HypnogramChartProps {
  data?: HypnogramDataPoint[];
}

// Varsayılan / Örnek uyku verisi
const defaultSleepData: HypnogramDataPoint[] = [
  { value: 3, label: '23:00' }, // Uyanık
  { value: 2, label: '23:30' }, // Hafif
  { value: 0, label: '00:00' }, // Derin
  {
    value: 1,
    label: '00:30',
    showDataPoint: true,
    dataPointColor: '#ef4444',
    dataPointText: 'Horlama',
    textColor: '#f87171',
    textFontSize: 9,
  }, // REM + Horlama
  { value: 0, label: '01:00' }, // Derin
  { value: 2, label: '01:30' }, // Hafif
  {
    value: 1,
    label: '02:00',
    showDataPoint: true,
    dataPointColor: '#f59e0b',
    dataPointText: 'Konuşma',
    textColor: '#fbbf24',
    textFontSize: 9,
  }, // REM + Konuşma
  { value: 0, label: '02:30' }, // Derin
  { value: 3, label: '03:00' }, // Uyanık (Gece kalkma)
  { value: 2, label: '03:30' }, // Hafif
  { value: 0, label: '04:00' }, // Derin
  { value: 1, label: '05:00' }, // REM
  { value: 3, label: '06:30' }, // Uyanış
];

export default function HypnogramChart({ data }: HypnogramChartProps) {
  const chartData = data && data.length > 0 ? data : defaultSleepData;
  const screenWidth = Dimensions.get('window').width;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Uyku Döngüsü (Hipnogram)</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendText}>Horlama</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>Konuşma</Text>
          </View>
        </View>
      </View>

      <View style={styles.chartContainer}>
        <LineChart
          data={chartData}
          height={180}
          width={screenWidth - 80}
          curved // Çizgileri yumuşatır (Sleep Cycle tarzı)
          isAnimated
          color="#38bdf8"
          thickness={3}
          dataPointsColor="#0284c7"
          dataPointsRadius={4}
          hideRules
          yAxisLabelTexts={['Derin', 'REM', 'Hafif', 'Uyanık']}
          stepValue={1}
          maxValue={3}
          noOfSections={3}
          yAxisColor="#334155"
          xAxisColor="#334155"
          yAxisTextStyle={{ color: '#94a3b8', fontSize: 11 }}
          xAxisLabelTextStyle={{ color: '#94a3b8', fontSize: 10 }}
          spacing={42}
          startFillColor="#0284c7"
          endFillColor="#0f172a"
          startOpacity={0.4}
          endOpacity={0.05}
          areaChart
        />
      </View>

      <View style={styles.stageScale}>
        <Text style={styles.stageHint}>
          💡 Evreler: 0: Derin Uyku • 1: REM • 2: Hafif Uyku • 3: Uyanık
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#cbd5e1',
  },
  chartContainer: {
    paddingLeft: 4,
    paddingBottom: 4,
    alignItems: 'center',
  },
  stageScale: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  stageHint: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
});
