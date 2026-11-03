#include "unlock.h"
#include <shlwapi.h>
#include <new>

LONG Objects = 0;
HINSTANCE Module = nullptr;

class Provider final : public ICredentialProvider, public ICredentialProviderSetUserArray {
    LONG references_ = 1;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario_ = CPUS_INVALID;
    ICredentialProviderEvents* events_ = nullptr;
    ICredentialProviderCredential* credential_ = nullptr;
    UINT_PTR context_ = 0;
    HWND window_ = nullptr;
    Nonce nonce_{};
    bool visible_ = false;
    ULONGLONG expires_ = 0;
    static LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM word, LPARAM data) {
        if (message == WM_NCCREATE) {
            auto create = reinterpret_cast<CREATESTRUCTW*>(data);
            SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(create->lpCreateParams));
        }
        auto provider = reinterpret_cast<Provider*>(GetWindowLongPtrW(window, GWLP_USERDATA));
        if (message == WM_TIMER && provider) { provider->Refresh(); return 0; }
        return DefWindowProcW(window, message, word, data);
    }
    void Refresh() {
        Request request;
        const bool pending = ReadRequest(request);
        // Claiming removes the request before Windows authenticates it. Do not interrupt that authentication.
        if (!pending && visible_ && UnixSeconds() < expires_) return;
        if (pending == visible_ && (!pending || request.nonce == nonce_)) return;
        if (credential_) { credential_->Release(); credential_ = nullptr; }
        visible_ = pending && SUCCEEDED(CreateCredential(request, scenario_, &credential_));
        nonce_ = request.nonce;
        expires_ = request.expires;
        // Timer callbacks run on the same COM apartment as Advise: no cross-thread COM pointers or waits.
        if (events_) events_->CredentialsChanged(context_);
    }
public:
    Provider() { InterlockedIncrement(&Objects); }
    ~Provider() {
        UnAdvise();
        if (credential_) credential_->Release();
        InterlockedDecrement(&Objects);
    }
    IFACEMETHODIMP QueryInterface(REFIID id, void** value) override {
        if (!value) return E_POINTER;
        *value = nullptr;
        if (id == IID_IUnknown || id == IID_ICredentialProvider) *value = static_cast<ICredentialProvider*>(this);
        else if (id == IID_ICredentialProviderSetUserArray) *value = static_cast<ICredentialProviderSetUserArray*>(this);
        else return E_NOINTERFACE;
        AddRef(); return S_OK;
    }
    IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&references_); }
    IFACEMETHODIMP_(ULONG) Release() override {
        const auto count = InterlockedDecrement(&references_); if (!count) delete this; return count;
    }
    IFACEMETHODIMP SetUsageScenario(CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario, DWORD) override {
        if (scenario != CPUS_LOGON && scenario != CPUS_UNLOCK_WORKSTATION) return E_NOTIMPL;
        scenario_ = scenario; return S_OK;
    }
    IFACEMETHODIMP SetSerialization(const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION*) override { return E_NOTIMPL; }
    IFACEMETHODIMP SetUserArray(ICredentialProviderUserArray*) override { return S_OK; }
    IFACEMETHODIMP Advise(ICredentialProviderEvents* events, UINT_PTR context) override {
        UnAdvise();
        if (!events) return E_INVALIDARG;
        events_ = events; events_->AddRef(); context_ = context;
        const wchar_t* name = L"RemoteAIUnlockProvider";
        WNDCLASSW type{}; type.lpfnWndProc = WindowProc; type.hInstance = Module; type.lpszClassName = name;
        if (!RegisterClassW(&type) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) return E_FAIL;
        window_ = CreateWindowExW(0, name, L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr, Module, this);
        if (!window_ || !SetTimer(window_, 1, 250, nullptr)) { UnAdvise(); return E_FAIL; }
        Refresh(); return S_OK;
    }
    IFACEMETHODIMP UnAdvise() override {
        if (window_) { KillTimer(window_, 1); DestroyWindow(window_); window_ = nullptr; }
        // Another live provider may still own a window of this class; the last one removes it before DLL unload.
        UnregisterClassW(L"RemoteAIUnlockProvider", Module);
        if (events_) { events_->Release(); events_ = nullptr; }
        return S_OK;
    }
    IFACEMETHODIMP GetFieldDescriptorCount(DWORD* count) override { *count = 1; return S_OK; }
    IFACEMETHODIMP GetFieldDescriptorAt(DWORD index, CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** result) override {
        *result = nullptr;
        if (index != 0) return E_INVALIDARG;
        auto field = static_cast<CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR*>(CoTaskMemAlloc(sizeof(**result)));
        if (!field) return E_OUTOFMEMORY;
        *field = {}; field->cpft = CPFT_LARGE_TEXT;
        HRESULT hr = SHStrDupW(L"Remote AI", &field->pszLabel);
        if (FAILED(hr)) { CoTaskMemFree(field); return hr; }
        *result = field; return S_OK;
    }
    IFACEMETHODIMP GetCredentialCount(DWORD* count, DWORD* selected, BOOL* automatic) override {
        *count = visible_ ? 1 : 0; *selected = visible_ ? 0 : CREDENTIAL_PROVIDER_NO_DEFAULT;
        *automatic = visible_; return S_OK;
    }
    IFACEMETHODIMP GetCredentialAt(DWORD index, ICredentialProviderCredential** result) override {
        *result = nullptr;
        if (index || !credential_) return E_INVALIDARG;
        *result = credential_; credential_->AddRef(); return S_OK;
    }
};

class Factory final : public IClassFactory {
    LONG references_ = 1;
public:
    Factory() { InterlockedIncrement(&Objects); }
    ~Factory() { InterlockedDecrement(&Objects); }
    IFACEMETHODIMP QueryInterface(REFIID id, void** value) override {
        if (!value) return E_POINTER;
        *value = nullptr;
        if (id != IID_IUnknown && id != IID_IClassFactory) return E_NOINTERFACE;
        *value = static_cast<IClassFactory*>(this); AddRef(); return S_OK;
    }
    IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&references_); }
    IFACEMETHODIMP_(ULONG) Release() override {
        const auto count = InterlockedDecrement(&references_); if (!count) delete this; return count;
    }
    IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID id, void** result) override {
        *result = nullptr;
        if (outer) return CLASS_E_NOAGGREGATION;
        auto provider = new (std::nothrow) Provider();
        if (!provider) return E_OUTOFMEMORY;
        const auto hr = provider->QueryInterface(id, result); provider->Release(); return hr;
    }
    IFACEMETHODIMP LockServer(BOOL lock) override {
        if (lock) InterlockedIncrement(&Objects); else InterlockedDecrement(&Objects); return S_OK;
    }
};

BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) { Module = module; DisableThreadLibraryCalls(module); }
    return TRUE;
}
STDAPI DllCanUnloadNow() { return InterlockedCompareExchange(&Objects, 0, 0) == 0 ? S_OK : S_FALSE; }
STDAPI DllGetClassObject(REFCLSID clsid, REFIID id, void** result) {
    if (!result) return E_POINTER;
    *result = nullptr;
    if (clsid != ProviderId) return CLASS_E_CLASSNOTAVAILABLE;
    auto factory = new (std::nothrow) Factory();
    if (!factory) return E_OUTOFMEMORY;
    const auto hr = factory->QueryInterface(id, result); factory->Release(); return hr;
}
