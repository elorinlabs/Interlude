import { RtcPeer } from '../remote-chat/rtcPeer';
import type { LoungeSyncTransport } from './syncConnection';

export const browserLoungeSync: LoungeSyncTransport = {
  randomBytes: size => crypto.getRandomValues(new Uint8Array(size)),
  createPeer: options => new RtcPeer(options, () => new RTCPeerConnection({ iceServers: options.iceServers })),
};
