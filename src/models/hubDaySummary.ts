export interface HubDayMetrics {
  date: string;
  codingMinutes: number;
  idleMinutes: number;
  devopsMinutes: number;
  meetingMinutes: number;
  emailMinutes: number;
  tasksClosed: number;
  commits: number;
  aiPrompts: number;
  standupsCopied: number;
  fileSaves: number;
  eventCount: number;
  outputScore: number;
  lastAction?: string;
  lastActivityAt?: string;
}

export interface HubPresence {
  state: string;
  platform: string;
  lastAction?: string;
  lastActivityAt?: string;
}

export interface HubDaySummary {
  connected: boolean;
  metrics?: HubDayMetrics;
  presence?: HubPresence;
  error?: string;
}
