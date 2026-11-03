import inlineCopy from '@interlude/i18n/copy/inline/desktop/utils/format';
import { interpolate as interpolateCopy } from '@interlude/i18n';
import { getLocale } from "../i18n";
import { uiText } from "../i18n/uiText";
import type { Language } from "../i18n";

export function initials(email: string) {
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

export function remainingTone(value: number) {
  if (value <= 15) return "danger";
  if (value <= 35) return "warning";
  return "good";
}

export type UsageResetWindow = "fiveHours" | "oneWeek";

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

export function resetClockTime(timestamp: number | null | undefined) {
  if (!timestamp) return null;
  const value = new Date(timestamp * 1000);
  if (Number.isNaN(value.getTime())) return null;
  const hour = padTimePart(value.getHours());
  const minute = padTimePart(value.getMinutes());
  const second = padTimePart(value.getSeconds());
  return `${hour}:${minute}:${second}`;
}

export function resetCountdownTime(timestamp: number | null | undefined, now = Date.now()) {
  if (!timestamp) return null;
  const distance = Math.max(0, timestamp * 1000 - now);
  const totalSeconds = Math.ceil(distance / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${padTimePart(minutes)}:${padTimePart(seconds)}`;
}

export function resetCountdownWithDays(timestamp: number | null | undefined, language: Language, now = Date.now()) {
  if (!timestamp) return null;
  const distance = Math.max(0, timestamp * 1000 - now);
  const totalSeconds = Math.ceil(distance / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}${(language !== "zh" && language !== "en" ? uiText("client.mobile.d", {}, language) : language === "zh" ? inlineCopy["text_49da61ce"] : inlineCopy["d_18ac3e73"])} ${padTimePart(hours)}:${padTimePart(minutes)}:${padTimePart(seconds)}`;
}

export function resetClockLabel(timestamp: number | null | undefined, language: Language) {
  const clock = resetClockTime(timestamp);
  if (!clock) return (language !== "zh" && language !== "en" ? uiText("client.usage.resetTimeUnknown", {}, language) : language === "zh" ? inlineCopy["text_2446e1e4"] : inlineCopy["Reset_time_unknown_bc41e55d"]);
  return (language !== "zh" && language !== "en" ? uiText("client.usage.resetsIn", { value1: clock }, language) : language === "zh" ? interpolateCopy(inlineCopy["value1_f1cf293f"], { value1: String(clock) }) : interpolateCopy(inlineCopy["Resets_at_value1_d613480a"], { value1: String(clock) }));
}

function resetDateTimeLabel(timestamp: number, language: Language) {
  const value = new Date(timestamp * 1000);
  if (Number.isNaN(value.getTime())) return (language !== "zh" && language !== "en" ? uiText("client.usage.resetTimeUnknown", {}, language) : language === "zh" ? inlineCopy["text_2446e1e4"] : inlineCopy["Reset_time_unknown_bc41e55d"]);
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const hour = padTimePart(value.getHours());
  const minute = padTimePart(value.getMinutes());
  const second = padTimePart(value.getSeconds());
  return (language !== "zh" && language !== "en" ? uiText("client.usage.resetsAfter", { value1: year, value2: padTimePart(month), value3: padTimePart(day), value4: hour, value5: minute, value6: second }, language) : language === "zh"
    ? interpolateCopy(inlineCopy["value1value2value3_value4value5value6_8397de1f"], { value1: String(year), value2: String(padTimePart(month)), value3: String(padTimePart(day)), value4: String(hour), value5: String(minute), value6: String(second) })
    : interpolateCopy(inlineCopy["Resets_on_value1value2value3_value4value5value6_192f4fe8"], { value1: String(year), value2: String(padTimePart(month)), value3: String(padTimePart(day)), value4: String(hour), value5: String(minute), value6: String(second) }));
}

export function resetLabel(
  timestamp: number | null | undefined,
  language: Language,
  windowType?: UsageResetWindow,
) {
  if (!timestamp) return (language !== "zh" && language !== "en" ? uiText("client.usage.resetTimeUnknown", {}, language) : language === "zh" ? inlineCopy["text_2446e1e4"] : inlineCopy["Reset_time_unknown_bc41e55d"]);
  if (windowType === "fiveHours") return resetClockLabel(timestamp, language);
  if (windowType === "oneWeek") return resetDateTimeLabel(timestamp, language);
  const distance = Math.max(0, timestamp * 1000 - Date.now());
  const minutes = Math.ceil(distance / 60_000);
  if (minutes < 60) return (language !== "zh" && language !== "en" ? uiText("client.usage.resetsInMinutes", { value1: minutes }, language) : language === "zh" ? interpolateCopy(inlineCopy["value1_2d75d586"], { value1: String(minutes) }) : interpolateCopy(inlineCopy["Resets_in_value1_min_47864007"], { value1: String(minutes) }));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    const remainder = rest ? ` ${uiText("client.settings.minutes", { value1: rest }, language)}` : "";
    return (language !== "zh" && language !== "en" ? uiText("client.usage.resetsInH", { value1: hours, value2: remainder }, language) : language === "zh"
      ? interpolateCopy(inlineCopy["value1_value2_06f9df56"], { value1: String(hours), value2: String(rest ? interpolateCopy(inlineCopy.minuteRemainderZh, { value1: rest }) : "") })
      : interpolateCopy(inlineCopy["Resets_in_value1_hrvalue2_4654aae9"], { value1: String(hours), value2: String(rest ? interpolateCopy(inlineCopy.minuteRemainderEn, { value1: rest }) : "") }));
  }
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return (language !== "zh" && language !== "en" ? uiText("client.usage.resetsInDH", { value1: days, value2: dayHours }, language) : language === "zh" ? interpolateCopy(inlineCopy["value1_value2_537c020c"], { value1: String(days), value2: String(dayHours) }) : interpolateCopy(inlineCopy["Resets_in_value1_d_value2_cd86d617"], { value1: String(days), value2: String(dayHours) }));
}

export function formatUpdated(timestamp: string | null | undefined, language: Language) {
  if (!timestamp) return (language !== "zh" && language !== "en" ? uiText("client.usage.notRefreshedYet", {}, language) : language === "zh" ? inlineCopy["text_712b0b1b"] : inlineCopy["Not_refreshed_1b0b5aca"]);
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return (language !== "zh" && language !== "en" ? uiText("client.app.unknownTime", {}, language) : language === "zh" ? inlineCopy["text_664939a1"] : inlineCopy["Unknown_time_bdda387b"]);
  return value.toLocaleString(getLocale(language), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatSystemTime(timestamp: string | null | undefined, language: Language) {
  if (!timestamp) return (language !== "zh" && language !== "en" ? uiText("client.app.unknownTime", {}, language) : language === "zh" ? inlineCopy["text_664939a1"] : inlineCopy["Unknown_time_bdda387b"]);
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return (language !== "zh" && language !== "en" ? uiText("client.app.unknownTime", {}, language) : language === "zh" ? inlineCopy["text_664939a1"] : inlineCopy["Unknown_time_bdda387b"]);
  return new Intl.DateTimeFormat(getLocale(language), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}
