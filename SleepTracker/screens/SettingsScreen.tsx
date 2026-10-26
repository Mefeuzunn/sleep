import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { Colors } from '../theme';

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
      if (onSettingsSaved) onSettingsSaved();
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

  const handleLogout = async () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkış yapmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert('Çıkış Hatası', error.message);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
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
            style={styles.timeTouchable}
            activeOpacity={0.7}>
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
              trackColor={{ false: '#334155', true: Colors.primary }}
              thumbColor={isSmartAlarmActive ? Colors.primaryLight : '#94A3B8'}
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

        {/* ÇIKIŞ YAP BUTONU */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Hesaptan Çıkış Yap</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  label: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  timeTouchable: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  timeText: {
    fontSize: 52,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  tapToChange: {
    color: Colors.textMuted,
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
    borderTopColor: Colors.borderSubtle,
    paddingTop: 14,
  },
  subLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
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
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primaryLight,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.snore,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  logoutText: {
    color: Colors.snore,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
