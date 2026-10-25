import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Vibration,
} from 'react-native';

interface AlarmScreenProps {
  isRinging: boolean;
  onStopAlarm: () => void;
  onSnooze?: (minutes: number) => void;
}

export default function AlarmScreen({
  isRinging,
  onStopAlarm,
  onSnooze,
}: AlarmScreenProps) {
  const [currentTime, setCurrentTime] = useState('');
  const [pressProgress, setPressProgress] = useState(false);

  // Ekranda güncel saati göstermek ve titreşimi yönetmek için
  useEffect(() => {
    if (isRinging) {
      const updateTime = () => {
        const now = new Date();
        setCurrentTime(
          now.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
      };

      updateTime();
      const interval = setInterval(updateTime, 1000);

      // Telefonun ritmik titremesi (1 saniye titre, 1 saniye bekle döngüsü)
      Vibration.vibrate([1000, 1000, 1000, 1000], true);

      return () => {
        clearInterval(interval);
        Vibration.cancel();
      };
    } else {
      Vibration.cancel();
    }
  }, [isRinging]);

  const handleSnooze = () => {
    Vibration.cancel();
    if (onSnooze) {
      onSnooze(10);
    }
  };

  return (
    <Modal
      visible={isRinging}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent>
      <View style={styles.container}>
        <Text style={styles.greeting}>Günaydın!</Text>
        <Text style={styles.time}>{currentTime}</Text>
        <Text style={styles.info}>
          Hafif uyku evrenizde uyandırıldınız. Dinlenmiş hissedebilirsiniz.
        </Text>

        {/* Kapatmak için UZUN BASMA (1.5 saniye) gerektiren buton */}
        <Pressable
          style={({ pressed }) => [
            styles.stopButton,
            pressed ? styles.stopButtonPressed : null,
          ]}
          delayLongPress={1500}
          onPressIn={() => setPressProgress(true)}
          onPressOut={() => setPressProgress(false)}
          onLongPress={() => {
            Vibration.cancel();
            setPressProgress(false);
            onStopAlarm();
          }}>
          <Text style={styles.buttonText}>
            {pressProgress ? 'Basılı Tutuluyor...' : 'Kapatmak İçin Basılı Tut'}
          </Text>
          <Text style={styles.buttonSubText}>1.5 saniye basılı tutun</Text>
        </Pressable>

        {/* 10 Dakika Ertele Butonu */}
        <Pressable style={styles.snoozeButton} onPress={handleSnooze}>
          <Text style={styles.snoozeText}>10 Dakika Ertele</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16', // Göz almayan derin karanlık tema
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  greeting: {
    fontSize: 26,
    color: '#94a3b8',
    marginBottom: 8,
    fontWeight: '600',
  },
  time: {
    fontSize: 84,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
    letterSpacing: 2,
  },
  info: {
    fontSize: 16,
    color: '#34d399',
    marginBottom: 60,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  stopButton: {
    backgroundColor: '#ef4444',
    width: 270,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 26,
    elevation: 8,
    shadowColor: '#ef4444',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  stopButtonPressed: {
    backgroundColor: '#dc2626',
    transform: [{ scale: 0.96 }],
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonSubText: {
    color: '#fecaca',
    fontSize: 11,
    marginTop: 2,
  },
  snoozeButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  snoozeText: {
    color: '#64748b',
    fontSize: 17,
    fontWeight: '500',
  },
});
