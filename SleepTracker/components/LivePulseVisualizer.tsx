import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors } from '../theme';

interface LivePulseVisualizerProps {
  isListening: boolean;
  dbLevel: number;
}

export default function LivePulseVisualizer({ isListening, dbLevel }: LivePulseVisualizerProps) {
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const barHeights = [
    useRef(new Animated.Value(8)).current,
    useRef(new Animated.Value(16)).current,
    useRef(new Animated.Value(24)).current,
    useRef(new Animated.Value(16)).current,
    useRef(new Animated.Value(8)).current,
  ];

  useEffect(() => {
    if (isListening) {
      // Dış halka nabız animasyonu
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim1, {
              toValue: 1.25,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim1, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseAnim2, {
              toValue: 1.45,
              duration: 2200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim2, {
              toValue: 1,
              duration: 2200,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ).start();
    } else {
      pulseAnim1.setValue(1);
      pulseAnim2.setValue(1);
    }
  }, [isListening, pulseAnim1, pulseAnim2]);

  // Ses desibeline göre barları dinamik boyutlandır
  useEffect(() => {
    if (isListening) {
      const normalizedFactor = Math.min(Math.max((dbLevel - 20) / 40, 0.2), 1.6);
      barHeights.forEach((anim, idx) => {
        const base = (idx === 2 ? 36 : idx === 1 || idx === 3 ? 24 : 14);
        Animated.spring(anim, {
          toValue: base * normalizedFactor,
          friction: 4,
          tension: 40,
          useNativeDriver: false,
        }).start();
      });
    } else {
      barHeights.forEach((anim, idx) => {
        anim.setValue(idx === 2 ? 14 : idx === 1 || idx === 3 ? 10 : 6);
      });
    }
  }, [dbLevel, isListening, barHeights]);

  return (
    <View style={styles.container}>
      {isListening && (
        <>
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseRingOuter,
              { transform: [{ scale: pulseAnim2 }] },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing,
              styles.pulseRingInner,
              { transform: [{ scale: pulseAnim1 }] },
            ]}
          />
        </>
      )}

      {/* Merkez Gövde */}
      <View style={[styles.centerDisc, isListening ? styles.activeDisc : styles.inactiveDisc]}>
        <View style={styles.barsRow}>
          {barHeights.map((animHeight, i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveformBar,
                {
                  height: animHeight,
                  backgroundColor: isListening ? (dbLevel > 40 ? Colors.snore : Colors.accent) : Colors.textMuted,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
  },
  pulseRingOuter: {
    width: 140,
    height: 140,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  pulseRingInner: {
    width: 115,
    height: 115,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  centerDisc: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    borderWidth: 1.5,
  },
  activeDisc: {
    backgroundColor: '#1E1B4B',
    borderColor: Colors.primaryLight,
  },
  inactiveDisc: {
    backgroundColor: '#1E293B',
    borderColor: Colors.borderSubtle,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
  },
});
