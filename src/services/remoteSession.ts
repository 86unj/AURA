/**
 * Transport-agnostic contract between the phone (camera) and the laptop.
 * Pick an implementation later (Supabase Realtime, WebSocket, WebRTC, ...)
 * and return it from `createRemoteSession`. The screen only depends on this.
 */
export type RemoteStatus = "disconnected" | "connecting" | "connected";

export interface RemoteSession {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Send one captured JPEG (base64, no data: prefix) to the laptop. */
  sendPhoto(base64: string): Promise<void>;
  onStatusChange(listener: (status: RemoteStatus) => void): () => void;
}

/** Placeholder until a transport is chosen. */
export function createRemoteSession(): RemoteSession {
  const listeners = new Set<(status: RemoteStatus) => void>();
  const notImplemented = () =>
    Promise.reject(new Error("Remote transport is not configured yet."));

  return {
    connect: notImplemented,
    disconnect: async () => {
      listeners.forEach((listener) => listener("disconnected"));
    },
    sendPhoto: notImplemented,
    onStatusChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
