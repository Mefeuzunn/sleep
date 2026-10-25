import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Platform,
  SafeAreaView,
  Alert,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const WAKE_WINDOWS = [15, 30, 45];
const SOUND_OPTIONS = ['Kuş Sesleri', 'Orman', 'Klasik Alarm'];

interface SettingsScreenProps {
  onBack?: () => void;
  onSettingsSaved?: () => void;
}

export default function SettingsScreen({
  onBack,
  onSettingsSaved,
}: SettingsScreenProps) {
  const [alarmTime, setAlarmTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [wakeWindow, setWakeWindow] = useState(30);
  const [selectedSound, setSelectedSound] = useState('Kuş Sesleri');
  const [isSmartAlarmActive, setIsSmartAlarmActive] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedTime = await AsyncStorage.getItem('alarmTime');
      const savedWindow = await AsyncStorage.getItem('wakeWindow');
      const savedSound = await AsyncStorage.getItem('selectedSound');
      const savedStatus = await AsyncStorage.getItem('isSmartAlarmActive');

      if (savedTime) setAlarmTime(new Date(savedTime));
      if (savedWindow) setWakeWindow(parseInt(savedWindow, 10));
      if (savedSound) setSelectedSound(savedSound);
      if (savedStatus) setIsSmartAlarmActive(JSON.parse(savedStatus));
    } catch (e) {
      console.error('Ayarlar yüklenemedi', e);
    }
  };

  const saveSettings = async (key: string, value: any) => {
    try {
      await AsyncStorage.setItem(
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      );
      if (onSettingsSaved) {
        onSettingsSaved();
      }
    } catch (e) {
      console.error('Ayar kaydedilemedi', e);
    }
  };

  const onChangeTime = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setAlarmTime(selectedDate);
      saveSettings('alarmTime', selectedDate.toISOString());
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Geri</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.header}>Alarm Ayarları</Text>
      </View>

      {/* 1. Alarm Saati */}
      <View style={styles.card}>
        <Text style={styles.label}>Uyanma Saati</Text>
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={styles.timeTouchable}>
          <Text style={styles.timeText}>
            {alarmTime.toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <Text style={styles.tapToChange}>Değiştirmek için dokunun</Text>
        </TouchableOpacity>
        {showPicker && (
          <DateTimePicker
            value={alarmTime}
            mode="time"
            is24Hour={true}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onChangeTime}
          />
        )}
      </View>

      {/* 2. Akıllı Uyanma ve Pencere */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Akıllı Uyanma (Smart Wake-Up)</Text>
            <Text style={styles.hint}>Hafif uyku evresinde uyandırır</Text>
          </View>
          <Switch
            value={isSmartAlarmActive}
            onValueChange={val => {
              setIsSmartAlarmActive(val);
              saveSettings('isSmartAlarmActive', val);
            }}
            trackColor={{ false: '#334155', true: '#38bdf8' }}
            thumbColor={isSmartAlarmActive ? '#0284c7' : '#94a3b8'}
          />
        </View>

        {isSmartAlarmActive && (
          <View style={styles.windowContainer}>
            <Text style={styles.subLabel}>Uyanma Penceresi</Text>
            <View style={styles.chipsRow}>
              {WAKE_WINDOWS.map(mins => (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.chip,
                    wakeWindow === mins && styles.chipActive,
                  ]}
                  onPress={() => {
                    setWakeWindow(mins);
                    saveSettings('wakeWindow', mins);
                  }}>
                  <Text
                    style={[
                      styles.chipText,
                      wakeWindow === mins && styles.chipTextActive,
                    ]}>
                    {mins} dk önce
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 3. Alarm Sesi Seçimi */}
      <View style={styles.card}>
        <Text style={styles.label}>Alarm Sesi</Text>
        <View style={styles.chipsRow}>
          {SOUND_OPTIONS.map(sound => (
            <TouchableOpacity
              key={sound}
              style={[
                styles.chip,
                selectedSound === sound && styles.chipActive,
              ]}
              onPress={() => {
                setSelectedSound(sound);
                saveSettings('selectedSound', sound);
              }}>
              <Text
                style={[
                  styles.chipText,
                  selectedSound === sound && styles.chipTextActive,
                ]}>
                {sound}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 4. Oturumu Kapat Butonu */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() => {
          Alert.alert('Çıkış Yap', 'Oturumunuzu kapatmak istediğinize emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            {
              text: 'Çıkış Yap',
              style: 'destructive',
              onPress: async () => {
                await supabase.auth.signOut();
              },
            },
          ]);
        }}>
        <Text style={styles.signOutButtonText}>🚪 Oturumu Kapat</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  timeTouchable: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  timeText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#38bdf8',
    letterSpacing: 1,
  },
  tapToChange: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  windowContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 14,
  },
  subLabel: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 10,
    fontWeight: '500',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  signOutButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#ef4444',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutButtonText: {
    color: '#ef4444',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
