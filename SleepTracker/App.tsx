import React, { useState, useEffect } from 'react';
import { StatusBar, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Session } from '@supabase/supabase-js';
import BootSplash from 'react-native-bootsplash';
import notifee, { EventType } from '@notifee/react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import BackgroundJob from 'react-native-background-actions';
import { supabase } from './supabase';
import { navigationRef, navigate } from './RootNavigation';

import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import ReportScreen from './screens/ReportScreen';
import SettingsScreen from './screens/SettingsScreen';

// Notifee Arka Plan Olayı Dinleyicisi (iOS Kilit Ekranı Bildirime Tıklama)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    console.log('Kullanıcı iOS alarm bildirimine tıkladı ve uyandı!', detail.notification);

    // 1. Dinleme servislerini durdur
    try {
      LiveAudioStream.stop();
      await BackgroundJob.stop();
    } catch (e) {
      console.warn('Arka plan servisi durdurma uyarısı:', e);
    }

    // 2. Bildirimi ekrandan temizle
    if (detail.notification?.id) {
      await notifee.cancelNotification(detail.notification.id);
    }

    // 3. Kullanıcıyı doğrudan Gece Raporu ekranına yönlendir
    navigate('Report');
  }
});

const Tab = createBottomTabNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Bildirim izinlerini iste
    notifee.requestPermission();

    // 2. Ön plandayken bildirime tıklama dinleyicisi
    const unsubscribeForeground = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS) {
        if (detail.notification?.id) {
          await notifee.cancelNotification(detail.notification.id);
        }
        navigate('Report');
      }
    });

    // 3. Supabase Oturum Kontrolü
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      BootSplash.hide({ fade: true });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      BootSplash.hide({ fade: true });
    });

    return () => {
      unsubscribeForeground();
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0f172a',
        }}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  // Kullanıcı giriş yapmadıysa Auth ekranı
  if (!session) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <AuthScreen />
      </>
    );
  }

  // Giriş yapıldıysa ana uygulama
  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle="light-content" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0f172a',
            borderBottomWidth: 1,
            borderBottomColor: '#1e293b',
          },
          headerTintColor: '#f8fafc',
          headerTitleStyle: {
            fontWeight: 'bold',
            fontSize: 18,
          },
          tabBarStyle: {
            backgroundColor: '#0f172a',
            borderTopWidth: 1,
            borderTopColor: '#1e293b',
            paddingBottom: 6,
            paddingTop: 6,
            height: 60,
          },
          tabBarActiveTintColor: '#38bdf8',
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'Uyku Takibi',
            tabBarLabel: 'Takip',
          }}
        />
        <Tab.Screen
          name="Report"
          component={ReportScreen}
          options={{
            title: 'Gece Raporu',
            tabBarLabel: 'Uyku Raporu',
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Alarm Ayarları',
            tabBarLabel: 'Ayarlar',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
