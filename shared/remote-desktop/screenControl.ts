interface ScreenDevice { platform: string }

export function supportsScreenControl(device: ScreenDevice) {
  return device.platform.trim().toLowerCase() === 'windows';
}
