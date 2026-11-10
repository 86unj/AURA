/**
 * WebRTC signaling over a Supabase Realtime broadcast channel.
 *
 * Phone and laptop are signed in as the same user and meet on
 * `remote:<user.id>`, so no pairing code is needed. Broadcast messages are
 * not stored; the channel only carries the handshake (offer/answer/ICE).
 * Video itself flows peer-to-peer over WebRTC.
 *
 * Protocol (event "signal", payload = SignalMessage):
 *   laptop → "laptop-ready" { sessionId }   laptop is listening
 *   phone  → "phone-hello"                  phone is ready, asks laptop to announce
 *   phone  → "offer"  { offerId, sdp }
 *   laptop → "answer" { offerId, sdp }
 *   both   → "ice"    { offerId, candidate }
 *   both   → "bye"                          leaving
 */
import { supabase } from "./supabaseClient";

export type RemoteRole = "phone" | "laptop";

export type SignalMessage = {
  from: RemoteRole;
  kind: "laptop-ready" | "phone-hello" | "offer" | "answer" | "ice" | "bye";
  data?: any;
};

export type SignalingChannel = {
  /** Resolves once subscribed; sends before that are queued. */
  ready: Promise<void>;
  send(kind: SignalMessage["kind"], data?: unknown): void;
  leave(): Promise<void>;
};

export function joinSignalingChannel(
  userId: string,
  role: RemoteRole,
  onMessage: (message: SignalMessage) => void,
): SignalingChannel {
  const channel = supabase.channel(`remote:${userId}`, {
    config: { broadcast: { self: false, ack: false } },
  });

  let subscribed = false;
  let left = false;
  const queue: SignalMessage[] = [];

  function transmit(message: SignalMessage) {
    channel
      .send({ type: "broadcast", event: "signal", payload: message })
      .catch((error: unknown) => console.warn("Signal send failed:", error));
  }

  const ready = new Promise<void>((resolve, reject) => {
    channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        const message = payload as SignalMessage | undefined;
        // Ignore our own role (e.g. two laptop tabs) and malformed payloads.
        if (message && message.from !== role && typeof message.kind === "string") {
          onMessage(message);
        }
      })
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          queue.splice(0).forEach(transmit);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(error ?? new Error(`Signaling channel ${status.toLowerCase()}.`));
        }
      });
  });
  // Avoid unhandled rejection warnings; callers can still await `ready`.
  ready.catch(() => {});

  return {
    ready,
    send(kind, data) {
      if (left) return;
      const message: SignalMessage = { from: role, kind, data };
      if (subscribed) transmit(message);
      else queue.push(message);
    },
    async leave() {
      if (left) return;
      left = true;
      if (subscribed) {
        await channel
          .send({ type: "broadcast", event: "signal", payload: { from: role, kind: "bye" } })
          .catch(() => {});
      }
      await supabase.removeChannel(channel);
    },
  };
}

/** STUN by default; add a TURN server via env for strict networks. */
export function getIceServers(): { urls: string | string[]; username?: string; credential?: string }[] {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turnUrl = process.env.EXPO_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: String(turnUrl)
        .split(",")
        .map((url: string) => url.trim()),
      username: process.env.EXPO_PUBLIC_TURN_USERNAME,
      credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}
