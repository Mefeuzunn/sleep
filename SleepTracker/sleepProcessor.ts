import { HypnogramDataPoint } from './HypnogramChart';

export interface RawMovement {
  id?: string;
  session_id?: string;
  intensity?: number;
  net_movement?: number;
  created_at: string;
}

export interface RawAudioEvent {
  id?: string;
  session_id?: string;
  event_type: 'snore' | 'speech' | 'cough' | string;
  transcript?: string | null;
  confidence?: number | null;
  created_at: string;
}

// 15 dakikalık zaman dilimi oluşturucu
const getEpochTime = (isoString: string): number => {
  const date = new Date(isoString);
  const minutes = date.getMinutes();
  // Dakikayı en yakın 15'in katına aşağı yuvarla (Örn: 12:38 -> 12:30)
  const epochMins = Math.floor(minutes / 15) * 15;
  date.setMinutes(epochMins, 0, 0);
  return date.getTime();
};

export const processSleepData = (
  movements: RawMovement[],
  audioEvents: RawAudioEvent[],
): HypnogramDataPoint[] => {
  const epochs: {
    [epochTime: string]: {
      movementSum: number;
      count: number;
      events: RawAudioEvent[];
    };
  } = {};

  // 1. Hareket Verilerini 15 Dakikalık Bloklara Grupla
  movements.forEach(m => {
    const epochTime = getEpochTime(m.created_at);
    if (!epochs[epochTime]) {
      epochs[epochTime] = { movementSum: 0, count: 0, events: [] };
    }
    // Veritabanında net_movement veya intensity alanı desteklenir
    const movementVal = m.net_movement ?? m.intensity ?? 0;
    epochs[epochTime].movementSum += Number(movementVal);
    epochs[epochTime].count += 1;
  });

  // 2. Ses Verilerini Aynı Bloklara Eşleştir
  audioEvents.forEach(a => {
    const epochTime = getEpochTime(a.created_at);
    if (!epochs[epochTime]) {
      epochs[epochTime] = { movementSum: 0, count: 0, events: [] };
    }
    epochs[epochTime].events.push(a);
  });

  // 3. Blokları Grafiğin (Y Ekseni) Formatına Çevir
  const sortedEpochTimes = Object.keys(epochs).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );

  const chartData: HypnogramDataPoint[] = sortedEpochTimes.map(epochTime => {
    const epoch = epochs[epochTime];
    const avgMovement = epoch.count > 0 ? epoch.movementSum / epoch.count : 0;

    // Uyku Evresi Tahmini:
    // 0: Derin Uyku, 1: REM, 2: Hafif Uyku, 3: Uyanık
    let sleepStage = 0; // Varsayılan: Derin Uyku

    if (avgMovement > 2.0) {
      sleepStage = 3; // Uyanık (Çok hareketli)
    } else if (avgMovement > 0.5) {
      sleepStage = 2; // Hafif Uyku (Dönüşler var)
    } else if (avgMovement < 0.2 && epoch.events.length > 0) {
      // Hareket yok ama düzensiz ses (horlama) varsa REM uykusu belirtisi olabilir
      sleepStage = 1;
    }

    // X Ekseni için saat etiketi (Örn: "02:15")
    const timeLabel = new Date(parseInt(epochTime, 10)).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Ses olaylarını grafikte nokta olarak göster (Öncelik: Konuşma > Horlama)
    let dataPointParams: Partial<HypnogramDataPoint> = {};
    if (epoch.events.length > 0) {
      const hasSpeech = epoch.events.some(e => e.event_type === 'speech');
      if (hasSpeech) {
        dataPointParams = {
          showDataPoint: true,
          dataPointColor: '#f59e0b',
          dataPointText: 'Konuşma',
          textColor: '#fbbf24',
          textFontSize: 9,
        };
      } else {
        dataPointParams = {
          showDataPoint: true,
          dataPointColor: '#ef4444',
          dataPointText: 'Horlama',
          textColor: '#f87171',
          textFontSize: 9,
        };
      }
    }

    return {
      value: sleepStage,
      label: timeLabel,
      ...dataPointParams,
    };
  });

  return chartData;
};
