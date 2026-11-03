import type { DesktopDisplay, DesktopResolution, DesktopSettings } from './protocol';

export interface DisplaySettingsProps {
  resolution?: { options: DesktopResolution[]; change: (size: DesktopResolution) => Promise<void> };
  displays: DesktopDisplay[];
  settings: DesktopSettings;
  update: (settings: DesktopSettings) => Promise<void>;
  saving: boolean;
  close: () => void;
  stats: { visible: boolean; toggle: () => void };
}

export const FRAME_RATE_OPTIONS = ['auto', 30, 60, 90, 144] as const;
export const QUALITY_OPTIONS = [
  { value: 'auto', label: "client.mobile.auto" },
  { value: 'smooth', label: "client.remoteDesktop.smooth" },
  { value: 'clear', label: "client.remoteDesktop.high" },
  { value: 'original', label: "client.remoteDesktop.ultra" },
] as const;

export const MOUSE_INSTRUCTIONS = [
  "client.remoteDesktop.outsideTheMouseControlsPinchToZoomAndSwipeWith",
  "client.remoteDesktop.swipeTheScreenOrLowerMousePadToMoveThe",
  "client.remoteDesktop.slideWhileHoldingTheLeftButtonToDragReleaseTo",
  "client.remoteDesktop.holdAndDragTheCenterArrowsToScrollReleaseTo",
  "client.remoteDesktop.dragTheHorizontalGripToMoveTheMousePanel",
] as const;
