import type { TrackerEvent } from '../types';

export const fallbackEventsByMonth: Record<string, TrackerEvent[]> = {
  '2026-10': [
    { name: 'STARTUP', timestamp: '2026-10-02 08:30:12' },
    { name: 'SHUTDOWN', timestamp: '2026-10-02 12:45:00' },
    { name: 'STARTUP', timestamp: '2026-10-02 13:30:20' },
    { name: 'SHUTDOWN', timestamp: '2026-10-02 17:48:35' },
    { name: 'STARTUP', timestamp: '2026-10-05 08:15:02' },
    { name: 'SHUTDOWN', timestamp: '2026-10-05 17:35:10' },
    { name: 'STARTUP', timestamp: '2026-10-06 08:42:19' },
    { name: 'SHUTDOWN', timestamp: '2026-10-06 18:05:44' },
    { name: 'STARTUP', timestamp: '2026-10-07 08:28:50' },
    { name: 'SHUTDOWN', timestamp: '2026-10-07 17:15:00' },
    { name: 'STARTUP', timestamp: '2026-10-08 09:02:11' },
    { name: 'SHUTDOWN', timestamp: '2026-10-08 17:55:22' },
    { name: 'STARTUP', timestamp: '2026-10-09 08:35:00' },
    { name: 'SHUTDOWN', timestamp: '2026-10-09 16:45:18' },
    { name: 'STARTUP', timestamp: '2026-10-12 08:08:53' },
    { name: 'SHUTDOWN', timestamp: '2026-10-12 17:22:40' },
    { name: 'STARTUP', timestamp: '2026-10-13 08:30:15' },
    { name: 'SHUTDOWN', timestamp: '2026-10-13 18:10:05' },
    { name: 'STARTUP', timestamp: '2026-10-14 08:40:00' },
    { name: 'SHUTDOWN', timestamp: '2026-10-14 17:30:25' },
    { name: 'STARTUP', timestamp: '2026-10-15 08:25:30' },
    { name: 'SHUTDOWN', timestamp: '2026-10-15 17:45:10' },
    { name: 'STARTUP', timestamp: '2026-10-16 08:50:00' },
    { name: 'SHUTDOWN', timestamp: '2026-10-16 16:30:00' },
    { name: 'STARTUP', timestamp: '2026-10-17 08:38:45' }
  ],
  '2026-09': [
    { name: 'STARTUP', timestamp: '2026-09-01 08:30:00' },
    { name: 'SHUTDOWN', timestamp: '2026-09-01 17:30:00' },
    { name: 'STARTUP', timestamp: '2026-09-02 08:45:10' },
    { name: 'SHUTDOWN', timestamp: '2026-09-02 17:50:00' },
    { name: 'STARTUP', timestamp: '2026-09-03 08:20:00' },
    { name: 'SHUTDOWN', timestamp: '2026-09-03 17:15:30' },
    { name: 'STARTUP', timestamp: '2026-09-04 08:55:00' },
    { name: 'SHUTDOWN', timestamp: '2026-09-04 16:45:00' },
    { name: 'STARTUP', timestamp: '2026-09-07 08:35:20' },
    { name: 'SHUTDOWN', timestamp: '2026-09-07 17:40:00' },
    { name: 'STARTUP', timestamp: '2026-09-08 08:40:00' },
    { name: 'SHUTDOWN', timestamp: '2026-09-08 18:00:15' },
    { name: 'STARTUP', timestamp: '2026-09-09 08:15:00' },
    { name: 'SHUTDOWN', timestamp: '2026-09-09 23:17:25' }
  ]
};
