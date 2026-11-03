#include "unlock.h"
#include <wincrypt.h>
#undef NDEBUG
#include <cassert>

STDAPI DllGetClassObject(REFCLSID, REFIID, void**);
STDAPI DllCanUnloadNow();

class Events final : public ICredentialProviderEvents {
    LONG references_ = 1;
public:
    unsigned notifications = 0;
    IFACEMETHODIMP QueryInterface(REFIID id, void** value) override {
        *value = nullptr;
        if (id != IID_IUnknown && id != IID_ICredentialProviderEvents) return E_NOINTERFACE;
        *value = this; AddRef(); return S_OK;
    }
    IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&references_); }
    IFACEMETHODIMP_(ULONG) Release() override { return InterlockedDecrement(&references_); }
    IFACEMETHODIMP CredentialsChanged(UINT_PTR context) override {
        assert(context == 123); ++notifications; return S_OK;
    }
};
template<class T> static void Append(std::vector<BYTE>& bytes, const T& value) {
    const auto start = reinterpret_cast<const BYTE*>(&value);
    bytes.insert(bytes.end(), start, start + sizeof(T));
}
static void Text(std::vector<BYTE>& bytes, const wchar_t* text) {
    Append(bytes, static_cast<DWORD>(wcslen(text)));
    const auto start = reinterpret_cast<const BYTE*>(text);
    bytes.insert(bytes.end(), start, start + wcslen(text) * sizeof(wchar_t));
}
static void WriteRequest(const std::wstring& root) {
    DWORD session = 0; assert(ProcessIdToSessionId(GetCurrentProcessId(), &session));
    std::vector<BYTE> bytes{'C','S','W','U','L','K','0','1'};
    Append(bytes, session); Append(bytes, UnixSeconds() + RequestLifetime); Append(bytes, Nonce{7});
    Text(bytes, L"COMPUTER\\fixture"); Text(bytes, L"fixture-password"); Text(bytes, L"S-1-5-21-1001");
    DATA_BLOB input{static_cast<DWORD>(bytes.size()), bytes.data()}, encrypted{};
    assert(CryptProtectData(&input, nullptr, nullptr, nullptr, nullptr,
        CRYPTPROTECT_LOCAL_MACHINE | CRYPTPROTECT_UI_FORBIDDEN, &encrypted));
    const auto path = root + L"\\unlock-request.bin";
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, 0, nullptr);
    assert(file != INVALID_HANDLE_VALUE);
    DWORD written = 0;
    assert(WriteFile(file, encrypted.pbData, encrypted.cbData, &written, nullptr));
    assert(written == encrypted.cbData);
    CloseHandle(file); LocalFree(encrypted.pbData); SecureZeroMemory(bytes.data(), bytes.size());
}
static void PumpUntil(Events& events) {
    const auto until = GetTickCount64() + 3000;
    while (!events.notifications && GetTickCount64() < until) {
        MSG message{};
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&message); DispatchMessageW(&message);
        }
        Sleep(10);
    }
    assert(events.notifications > 0);
}
static void TestSerialization(ICredentialProvider* provider) {
    DWORD count = 0, selected = 9; BOOL automatic = FALSE;
    assert(SUCCEEDED(provider->GetCredentialCount(&count, &selected, &automatic)));
    assert(count == 1 && selected == 0 && automatic);
    ICredentialProviderCredential* credential = nullptr;
    assert(SUCCEEDED(provider->GetCredentialAt(0, &credential)));
    CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE response{};
    CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION result{};
    PWSTR text = nullptr; CREDENTIAL_PROVIDER_STATUS_ICON icon{};
    assert(SUCCEEDED(credential->GetSerialization(&response, &result, &text, &icon)));
    assert(response == CPGSR_RETURN_CREDENTIAL_FINISHED && result.cbSerialization > 0);
    SecureZeroMemory(result.rgbSerialization, result.cbSerialization); CoTaskMemFree(result.rgbSerialization);
    assert(SUCCEEDED(credential->GetSerialization(&response, &result, &text, &icon)));
    assert(response == CPGSR_NO_CREDENTIAL_NOT_FINISHED && !result.rgbSerialization);
    assert(SUCCEEDED(credential->ReportResult(static_cast<NTSTATUS>(0xC000006DL), 0, &text, &icon)));
    credential->Release();
}
void TestProvider() {
    assert(SUCCEEDED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED)));
    Module = GetModuleHandleW(nullptr);
    wchar_t temp[MAX_PATH]{}; assert(GetTempPathW(MAX_PATH, temp));
    const auto root = std::wstring(temp) + L"csw-unlock-test-" + std::to_wstring(GetCurrentProcessId());
    assert(CreateDirectoryW(root.c_str(), nullptr));
    SetEnvironmentVariableW(L"CSW_UNLOCK_TEST_ROOT", root.c_str());
    IClassFactory* factory = nullptr;
    assert(SUCCEEDED(DllGetClassObject(ProviderId, IID_PPV_ARGS(&factory))));
    ICredentialProvider* provider = nullptr;
    assert(SUCCEEDED(factory->CreateInstance(nullptr, IID_PPV_ARGS(&provider)))); factory->Release();
    assert(provider->SetUsageScenario(CPUS_CREDUI, 0) == E_NOTIMPL);
    assert(SUCCEEDED(provider->SetUsageScenario(CPUS_LOGON, 0)));
    Events events;
    assert(SUCCEEDED(provider->Advise(&events, 123)));
    DWORD count = 9, selected = 9; BOOL automatic = TRUE;
    assert(SUCCEEDED(provider->GetCredentialCount(&count, &selected, &automatic)));
    assert(count == 0 && selected == CREDENTIAL_PROVIDER_NO_DEFAULT && !automatic);
    WriteRequest(root); PumpUntil(events); TestSerialization(provider);
    Request consumed;
    assert(!ReadRequest(consumed));
    assert(GetFileAttributesW((root + L"\\unlock-result.bin").c_str()) != INVALID_FILE_ATTRIBUTES);
    assert(SUCCEEDED(provider->UnAdvise())); provider->Release();
    assert(DllCanUnloadNow() == S_OK);
    DeleteFileW((root + L"\\unlock-result.bin").c_str());
    assert(RemoveDirectoryW(root.c_str()));
    SetEnvironmentVariableW(L"CSW_UNLOCK_TEST_ROOT", nullptr); CoUninitialize();
}
