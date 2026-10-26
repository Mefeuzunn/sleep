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
import { Colors } from './theme';
import { MoonIcon, ChartIcon, SettingsIcon } from './components/Icons';

import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import ReportScreen from './screens/ReportScreen';
import SettingsScreen from './screens/SettingsScreen';

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    try {
      LiveAudioStream.stop();
      await BackgroundJob.stop();
    } catch (e) {
      console.warn('Arka plan servisi durdurma uyarısı:', e);
    }

    if (detail.notification?.id) {
      await notifee.cancelNotification(detail.notification.id);
    }

    navigate('Report');
  }
});

const Tab = createBottomTabNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    notifee.requestPermission();

    const unsubscribeForeground = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS) {
        if (detail.notification?.id) {
          await notifee.cancelNotification(detail.notification.id);
        }
        navigate('Report');
      }
    });

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
          backgroundColor: Colors.background,
        }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <AuthScreen />
      </>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar barStyle="light-content" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: Colors.background,
            borderBottomWidth: 1,
            borderBottomColor: Colors.borderSubtle,
          },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: {
            fontWeight: 'bold',
            fontSize: 18,
          },
          tabBarStyle: {
            backgroundColor: Colors.surfaceSubtle,
            borderTopWidth: 1,
            borderTopColor: Colors.borderSubtle,
            paddingBottom: 8,
            paddingTop: 8,
            height: 64, // 44px+ touch standard
          },
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: 2,
          },
        }}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'Uyku Takibi',
            tabBarLabel: 'Takip',
            tabBarIcon: ({ color, size }) => <MoonIcon size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="Report"
          component={ReportScreen}
          options={{
            title: 'Gece Raporu',
            tabBarLabel: 'Uyku Raporu',
            tabBarIcon: ({ color, size }) => <ChartIcon size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Alarm Ayarları',
            tabBarLabel: 'Ayarlar',
            tabBarIcon: ({ color, size }) => <SettingsIcon size={size} color={color} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
