#pragma once
#include <windows.h>
#include <stdexcept>

inline bool start_hidden() {
    wchar_t value[2]{};
    return GetEnvironmentVariableW(L"CSW_PRIVACY_START_HIDDEN", value, 2) == 1 && value[0] == L'1';
}

// The device's explicit power choice belongs to the interactive host, not this capture lease.
inline void retain_screen_power() {
    HANDLE event = OpenEventW(SYNCHRONIZE, FALSE, L"Local\\RemoteAI.ScreenPower.Off");
    if (!event) return;
    const bool off = WaitForSingleObject(event, 0) == WAIT_OBJECT_0;
    CloseHandle(event);
    if (!off) return;
    HWND target = FindWindowW(L"Progman", nullptr);
    if (!target) target = GetDesktopWindow();
    if (!SendMessageTimeoutW(target, WM_SYSCOMMAND, SC_MONITORPOWER, 2,
        SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT, 2000, nullptr))
        throw std::runtime_error("display power retention failed");
}
