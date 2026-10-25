import { processSleepData, RawMovement, RawAudioEvent } from '../sleepProcessor';

describe('Sleep Data Processor (Epoch Algorithm)', () => {
  it('correctly classifies movements and detects sleep stages', () => {
    const movements: RawMovement[] = [
      { created_at: '2026-10-25T00:05:00Z', net_movement: 2.5 },
      { created_at: '2026-10-25T00:10:00Z', net_movement: 2.1 },
    ];
    const audioEvents: RawAudioEvent[] = [
      { created_at: '2026-10-25T00:08:00Z', event_type: 'snore' },
    ];

    const result = processSleepData(movements, audioEvents);

    expect(result.length).toBe(1);
    expect(result[0].value).toBe(3); // Awake (>2.0 movement)
    expect(result[0].showDataPoint).toBe(true);
    expect(result[0].dataPointText).toBe('Horlama');
  });

  it('classifies quiet periods as Deep Sleep', () => {
    const movements: RawMovement[] = [
      { created_at: '2026-10-25T01:05:00Z', net_movement: 0.1 },
    ];
    const audioEvents: RawAudioEvent[] = [];

    const result = processSleepData(movements, audioEvents);

    expect(result.length).toBe(1);
    expect(result[0].value).toBe(0); // Deep Sleep (<=0.5 movement, no audio)
  });

  it('detects speech events on the chart', () => {
    const movements: RawMovement[] = [];
    const audioEvents: RawAudioEvent[] = [
      { created_at: '2026-10-25T02:12:00Z', event_type: 'speech', transcript: 'su verin' },
    ];

    const result = processSleepData(movements, audioEvents);

    expect(result.length).toBe(1);
    expect(result[0].value).toBe(1); // REM (audio with zero movement)
    expect(result[0].showDataPoint).toBe(true);
    expect(result[0].dataPointText).toBe('Konuşma');
  });
});
