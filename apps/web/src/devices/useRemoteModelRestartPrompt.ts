import { t } from '../i18n';
import { useCallback } from "react";
import { Dialog, Toast } from "antd-mobile";
import { useAppDispatch, useAppSelector } from "../hooks";
import { restartDeviceCodex } from "../store";

export function useRemoteModelRestartPrompt() {
  const dispatch = useAppDispatch();
  const { devices, restartingDeviceId } = useAppSelector((state) => state.data);
  return useCallback(async (deviceId: string) => {
    const device = devices.find((candidate) => candidate.deviceId === deviceId);
    if (!device?.capabilities?.includes("restart-codex")) {
      await Dialog.alert({
        title: t("client.app.restartToLoadTheCurrentModel"),
        content: t("client.app.youSwitchedBetweenAnOfficialModelAndAThirdParty"),
        confirmText: t("client.app.gotIt"),
      });
      return;
    }
    const confirmed = await Dialog.confirm({
      title: t("client.app.restartToLoadTheCurrentModel"),
      content: t("client.app.restartChatgptCodexOnThatComputerToFinishSwitchingThe"),
      confirmText: t("client.app.restartNow"),
      cancelText: t("client.app.later"),
    });
    if (!confirmed || restartingDeviceId) return;
    try {
      await dispatch(restartDeviceCodex(deviceId)).unwrap();
      Toast.show({ icon: "success", content: t("client.app.chatgptCodexRestartedOnTheSelectedComputer") });
    } catch { /* The global error toast reports the failure. */ }
  }, [devices, dispatch, restartingDeviceId]);
}
