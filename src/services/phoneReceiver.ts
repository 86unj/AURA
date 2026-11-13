/**
 * Laptop side of the phone → laptop video link (browser only).
 * Waits for the phone's offer, answers it and hands the incoming video
 * stream to the caller. Also relays capture controls from the phone.
 */
import {
  getIceServers,
  joinSignalingChannel,
  RemoteControlAction,
  RemotePhase,
  SignalMessage,
} from "./remoteSignaling";

export type ReceiverStatus = "waiting" | "connecting" | "connected" | "error";

export type PhoneReceiver = {
  stop(): Promise<void>;
  sendPhase(phase: RemotePhase): void;
};

type Callbacks = {
  onStream(stream: MediaStream | null): void;
  onStatus(status: ReceiverStatus, detail?: string): void;
  onControl(action: RemoteControlAction): void;
};

export function startPhoneReceiver(
  userId: string,
  { onStream, onStatus, onControl }: Callbacks,
): PhoneReceiver {
  // Random id so the phone can tell a reloaded laptop from the current one.
  const sessionId = Math.random().toString(36).slice(2);
  let pc: RTCPeerConnection | null = null;
  let offerId: string | null = null;
  let pendingIce: { offerId: string; candidate: RTCIceCandidateInit }[] = [];
  let stopped = false;

  const channel = joinSignalingChannel(userId, "laptop", (message) => {
    handle(message).catch((error) => {
      console.error("Receiver signaling error:", error);
      onStatus("error", error instanceof Error ? error.message : String(error));
    });
  });

  onStatus("waiting");
  channel.ready
    .then(() => channel.send("laptop-ready", { sessionId }))
    .catch((error) => onStatus("error", error instanceof Error ? error.message : String(error)));

  function closePeer() {
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    pc = null;
    offerId = null;
    pendingIce = [];
  }

  async function handle(message: SignalMessage) {
    if (stopped) return;
    switch (message.kind) {
      case "phone-hello":
        channel.send("laptop-ready", { sessionId });
        break;

      case "offer": {
        // A new offer always replaces the old connection (phone reloaded/retried).
        const held = pendingIce;
        closePeer();
        pendingIce = held;
        onStream(null);
        onStatus("connecting");
        const thisOffer: string = message.data.offerId;
        offerId = thisOffer;
        const peer = new RTCPeerConnection({ iceServers: getIceServers() });
        pc = peer;

        peer.ontrack = (event) => {
          onStream(event.streams[0] ?? new MediaStream([event.track]));
        };
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            channel.send("ice", { offerId: thisOffer, candidate: event.candidate.toJSON() });
          }
        };
        peer.onconnectionstatechange = () => {
          if (pc !== peer) return;
          const state = peer.connectionState;
          if (state === "connected") onStatus("connected");
          else if (state === "failed") onStatus("error", "Connection failed. A TURN server may be needed on this network.");
          else if (state === "disconnected" || state === "closed") onStatus("waiting");
        };

        // Strip orientation extension so negotiation can't re-enable metadata
        // rotation (Aura Lab's WebGL upload ignores it and looks sideways).
        const remoteSdp = String(message.data.sdp || "").replace(
          /^a=extmap:[^\r\n]*urn:3gpp:video-orientation[^\r\n]*\r?\n/gm,
          "",
        );
        await peer.setRemoteDescription({ type: "offer", sdp: remoteSdp });
        const early = pendingIce.filter((item) => item.offerId === thisOffer);
        pendingIce = [];
        for (const item of early) {
          await peer.addIceCandidate(item.candidate).catch(() => {});
        }
        const answer = await peer.createAnswer();
        const answerSdp = String(answer.sdp || "").replace(
          /^a=extmap:[^\r\n]*urn:3gpp:video-orientation[^\r\n]*\r?\n/gm,
          "",
        );
        await peer.setLocalDescription({ type: "answer", sdp: answerSdp });
        channel.send("answer", { offerId: thisOffer, sdp: answerSdp });
        break;
      }

      case "ice": {
        const id: string | undefined = message.data?.offerId;
        const candidate: RTCIceCandidateInit | undefined = message.data?.candidate;
        if (!id || !candidate) return;
        if (id === offerId && pc?.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => {});
        } else {
          // Offer not applied yet (or not seen yet): hold until it is.
          pendingIce.push({ offerId: id, candidate });
        }
        break;
      }

      case "control": {
        const action = message.data?.action as RemoteControlAction | undefined;
        if (action === "capture" || action === "analyze" || action === "retake") {
          onControl(action);
        }
        break;
      }

      case "bye":
        closePeer();
        onStream(null);
        onStatus("waiting");
        break;
    }
  }

  return {
    sendPhase(phase) {
      if (stopped) return;
      channel.send("phase", { phase });
    },
    async stop() {
      stopped = true;
      closePeer();
      await channel.leave();
    },
  };
}
