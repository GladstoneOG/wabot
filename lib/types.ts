export type StoredConfig = {
  recipientsRaw: string;
  message: string;
  minDelaySec: number;
  maxDelaySec: number;
  intervalMinutes: number;
};

export type BroadcastConfig = StoredConfig & {
  recipients: string[];
};

export type BroadcastLogEntry = {
  id: string;
  timestamp: string;
  recipients: string[];
  success: number;
  failed: number;
  messagePreview: string;
};
