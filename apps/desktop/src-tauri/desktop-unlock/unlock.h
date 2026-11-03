#pragma once
#include <windows.h>
#include <credentialprovider.h>
#include <array>
#include <string>
#include <vector>

// This provider adds a tile for one short-lived, authorized remote request only.
// It never filters or replaces Windows' other sign-in providers.
inline constexpr GUID ProviderId =
    {0x64053f3e, 0x11a6, 0x47e0, {0x93, 0xdc, 0xcf, 0x63, 0xd7, 0x67, 0x4b, 0x7a}};
inline constexpr DWORD MaxRequestBytes = 16384;
inline constexpr DWORD RequestLifetime = 10;
using Nonce = std::array<BYTE, 16>;
struct Request {
    DWORD session = 0;
    ULONGLONG expires = 0;
    Nonce nonce{};
    std::wstring username, password, sid;
    Request() = default;
    Request(const Request&) = delete;
    Request& operator=(const Request&) = delete;
    ~Request() { SecureZeroMemory(password.data(), password.size() * sizeof(wchar_t)); }
};
ULONGLONG UnixSeconds();
bool ParseRequest(const BYTE* bytes, size_t length, DWORD session, ULONGLONG now, Request& request);
bool ReadRequest(Request& request, const Nonce* consume = nullptr);
void WriteResult(const Nonce& nonce, NTSTATUS status);
HRESULT Serialize(Request& request, CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario,
                  CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* result);
HRESULT CreateCredential(const Request& request, CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario,
                         ICredentialProviderCredential** credential);
extern LONG Objects;
extern HINSTANCE Module;
