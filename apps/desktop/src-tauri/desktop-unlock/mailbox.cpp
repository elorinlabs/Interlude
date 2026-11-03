#include "unlock.h"
#include <shlobj.h>
#include <wincrypt.h>
#include <algorithm>
#include <cstring>

ULONGLONG UnixSeconds() {
    FILETIME value{};
    GetSystemTimeAsFileTime(&value);
    ULARGE_INTEGER ticks{};
    ticks.LowPart = value.dwLowDateTime;
    ticks.HighPart = value.dwHighDateTime;
    return ticks.QuadPart / 10000000ULL - 11644473600ULL;
}

template<class T> static bool Take(const BYTE*& bytes, size_t& length, T& result) {
    if (length < sizeof(T)) return false;
    memcpy(&result, bytes, sizeof(T));
    bytes += sizeof(T); length -= sizeof(T);
    return true;
}

static bool Text(const BYTE*& bytes, size_t& length, std::wstring& value, DWORD maximum) {
    DWORD count = 0;
    if (!Take(bytes, length, count) || !count || count > maximum || length < count * sizeof(wchar_t)) return false;
    value.resize(count);
    memcpy(value.data(), bytes, count * sizeof(wchar_t));
    bytes += count * sizeof(wchar_t); length -= count * sizeof(wchar_t);
    return value.find(L'\0') == std::wstring::npos;
}

bool ParseRequest(const BYTE* bytes, size_t length, DWORD session, ULONGLONG now, Request& request) {
    const BYTE magic[] = {'C', 'S', 'W', 'U', 'L', 'K', '0', '1'};
    if (length > MaxRequestBytes || length < sizeof(magic) || memcmp(bytes, magic, sizeof(magic))) return false;
    bytes += sizeof(magic); length -= sizeof(magic);
    return Take(bytes, length, request.session) && request.session == session
        && Take(bytes, length, request.expires) && request.expires > now
        && request.expires - now <= RequestLifetime
        && Take(bytes, length, request.nonce)
        && Text(bytes, length, request.username, 256)
        && Text(bytes, length, request.password, 256)
        && Text(bytes, length, request.sid, 184) && request.sid.find(L"S-1-") == 0 && length == 0;
}

static std::wstring Path(const wchar_t* name) {
#ifdef UNLOCK_TESTING
    // The test binary uses a private temporary directory; the production DLL has no path override.
    wchar_t testRoot[MAX_PATH]{};
    if (GetEnvironmentVariableW(L"CSW_UNLOCK_TEST_ROOT", testRoot, MAX_PATH))
        return std::wstring(testRoot) + L"\\" + name;
#endif
    PWSTR folder = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_ProgramData, 0, nullptr, &folder))) return {};
    std::wstring path(folder);
    CoTaskMemFree(folder);
    return path + L"\\CodexSwitchRemoteDesktop\\" + name;
}

static bool ReadEncrypted(const std::wstring& path, Request& request) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_DELETE, nullptr,
                              OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    BY_HANDLE_FILE_INFORMATION info{};
    bool valid = GetFileInformationByHandle(file, &info) && !(info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)
        && info.nFileSizeHigh == 0 && info.nFileSizeLow > 0 && info.nFileSizeLow <= MaxRequestBytes;
    std::vector<BYTE> bytes(valid ? info.nFileSizeLow : 0);
    DWORD read = 0;
    valid = valid && ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr)
        && read == bytes.size();
    CloseHandle(file);
    if (!valid) return false;
    DATA_BLOB input{read, bytes.data()}, output{};
    if (!CryptUnprotectData(&input, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &output)) return false;
    DWORD session = 0;
    valid = ProcessIdToSessionId(GetCurrentProcessId(), &session)
        && ParseRequest(output.pbData, output.cbData, session, UnixSeconds(), request);
    SecureZeroMemory(output.pbData, output.cbData);
    LocalFree(output.pbData);
    return valid;
}

bool ReadRequest(Request& request, const Nonce* consume) {
    auto source = Path(L"unlock-request.bin");
    if (source.empty()) return false;
    if (!consume) return ReadEncrypted(source, request);
    // Atomic claiming prevents LogonUI re-enumeration or another process from replaying a password.
    const auto claimed = Path(L"unlock-claimed.bin");
    if (!MoveFileW(source.c_str(), claimed.c_str())) return false;
    const bool valid = ReadEncrypted(claimed, request) && request.nonce == *consume;
    DeleteFileW(claimed.c_str());
    return valid;
}

void WriteResult(const Nonce& nonce, NTSTATUS status) {
    const auto path = Path(L"unlock-result.tmp"), target = Path(L"unlock-result.bin");
    if (path.empty()) return;
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return;
    std::array<BYTE, 20> bytes{};
    memcpy(bytes.data(), nonce.data(), nonce.size());
    memcpy(bytes.data() + nonce.size(), &status, sizeof(status));
    DWORD written = 0;
    const bool valid = WriteFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr)
        && written == bytes.size() && FlushFileBuffers(file);
    CloseHandle(file);
    if (valid) MoveFileExW(path.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH);
    else DeleteFileW(path.c_str());
}
