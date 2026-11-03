#include "unlock.h"
#include <ntsecapi.h>
#undef NDEBUG
#include <cassert>
#include <cstring>

template<class T> static void Append(std::vector<BYTE>& bytes, const T& value) {
    const auto start = reinterpret_cast<const BYTE*>(&value);
    bytes.insert(bytes.end(), start, start + sizeof(T));
}
static void Text(std::vector<BYTE>& bytes, const wchar_t* text) {
    DWORD length = static_cast<DWORD>(wcslen(text));
    Append(bytes, length);
    const auto start = reinterpret_cast<const BYTE*>(text);
    bytes.insert(bytes.end(), start, start + length * sizeof(wchar_t));
}
static std::vector<BYTE> Fixture() {
    std::vector<BYTE> bytes{'C','S','W','U','L','K','0','1'};
    Append(bytes, DWORD{4}); Append(bytes, ULONGLONG{110}); Append(bytes, Nonce{1});
    Text(bytes, L"COMPUTER\\alice"); Text(bytes, L"fixture-password"); Text(bytes, L"S-1-5-21-1001");
    return bytes;
}
void TestProvider();
int main() {
    auto bytes = Fixture();
    Request valid;
    assert(ParseRequest(bytes.data(), bytes.size(), 4, 100, valid));
    for (size_t length = 0; length < bytes.size(); ++length) {
        Request truncated;
        assert(!ParseRequest(bytes.data(), length, 4, 100, truncated));
    }
    for (const auto now : {99ULL, 110ULL, 111ULL}) {
        Request expired;
        assert(!ParseRequest(bytes.data(), bytes.size(), 4, now, expired));
    }
    Request other;
    assert(!ParseRequest(bytes.data(), bytes.size(), 5, 100, other));
    bytes.push_back(0);
    assert(!ParseRequest(bytes.data(), bytes.size(), 4, 100, other));
    bytes = Fixture(); bytes[0] = 0;
    assert(!ParseRequest(bytes.data(), bytes.size(), 4, 100, other));
    // Serialization does not attempt a logon or modify the running Windows session.
    for (const auto scenario : {CPUS_LOGON, CPUS_UNLOCK_WORKSTATION}) {
        CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION packed{};
        assert(SUCCEEDED(Serialize(valid, scenario, &packed)));
        assert(packed.clsidCredentialProvider == ProviderId);
        assert(packed.cbSerialization >= sizeof(KERB_INTERACTIVE_UNLOCK_LOGON));
        const auto logon = reinterpret_cast<KERB_INTERACTIVE_UNLOCK_LOGON*>(packed.rgbSerialization);
        assert(logon->Logon.MessageType == (scenario == CPUS_LOGON ? KerbInteractiveLogon : KerbWorkstationUnlockLogon));
        SecureZeroMemory(packed.rgbSerialization, packed.cbSerialization); CoTaskMemFree(packed.rgbSerialization);
    }
    CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION unsupported{};
    assert(Serialize(valid, CPUS_CREDUI, &unsupported) == E_NOTIMPL);
    for (const auto username : {L"MicrosoftAccount\\fixture@example.test", L"microsoftaccount\\fixture@example.test",
                                L"AzureAD\\fixture@example.test"}) {
        valid.username = username;
        CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION packed{};
        assert(SUCCEEDED(Serialize(valid, CPUS_LOGON, &packed)));
        assert(packed.cbSerialization >= sizeof(ULONG));
        assert(*reinterpret_cast<ULONG*>(packed.rgbSerialization) != static_cast<ULONG>(KerbInteractiveLogon));
        SecureZeroMemory(packed.rgbSerialization, packed.cbSerialization); CoTaskMemFree(packed.rgbSerialization);
    }
    TestProvider();
    return 0;
}
