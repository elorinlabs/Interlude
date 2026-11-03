import { defaultText } from '../localization/messages';
import type { RequestSpeed } from './composer';

export const REQUEST_SPEED_LABELS: Record<RequestSpeed, string> = {
  normal: "client.chat.standardMode", fast: "client.chat.fastMode.6e02d1", ultrafast: "client.chat.ultrafastMode",
};
const NEXT_SPEED: Record<RequestSpeed, RequestSpeed> = {
  normal: 'fast', fast: 'ultrafast', ultrafast: 'normal',
};
export const nextRequestSpeed = (speed: RequestSpeed, available = true) => available ? NEXT_SPEED[speed] : 'normal';
export const speedBoltCount = (speed: RequestSpeed) => ({ normal: 0, fast: 1, ultrafast: 2 })[speed];

export function requestSpeedSuffix(speed?: RequestSpeed, translate = defaultText) {
  return speed && speed !== 'normal' ? ` · ${translate(REQUEST_SPEED_LABELS[speed])}` : '';
}

export function requestSpeedLabel(speed: RequestSpeed, translate = defaultText, available = true) {
  return `${translate(REQUEST_SPEED_LABELS[speed])} · ${translate("client.chat.clickToSwitchTo")}${translate(
    REQUEST_SPEED_LABELS[nextRequestSpeed(speed, available)])}`;
}
