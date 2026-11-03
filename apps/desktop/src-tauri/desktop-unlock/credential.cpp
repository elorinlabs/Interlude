#include "unlock.h"
#include <shlwapi.h>
#include <new>

class Credential final : public ICredentialProviderCredential2 {
    LONG references_ = 1;
    Nonce nonce_;
    std::wstring sid_;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario_;
    bool submitted_ = false;
public:
    Credential(const Request& request, CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario)
        : nonce_(request.nonce), sid_(request.sid), scenario_(scenario) { InterlockedIncrement(&Objects); }
    ~Credential() { InterlockedDecrement(&Objects); }
    IFACEMETHODIMP QueryInterface(REFIID id, void** value) override {
        if (!value) return E_POINTER;
        *value = nullptr;
        if (id != IID_IUnknown && id != IID_ICredentialProviderCredential && id != IID_ICredentialProviderCredential2)
            return E_NOINTERFACE;
        *value = static_cast<ICredentialProviderCredential2*>(this); AddRef(); return S_OK;
    }
    IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&references_); }
    IFACEMETHODIMP_(ULONG) Release() override {
        const auto count = InterlockedDecrement(&references_); if (!count) delete this; return count;
    }
    IFACEMETHODIMP Advise(ICredentialProviderCredentialEvents*) override { return S_OK; }
    IFACEMETHODIMP UnAdvise() override { return S_OK; }
    IFACEMETHODIMP SetSelected(BOOL* automatic) override { *automatic = !submitted_; return S_OK; }
    IFACEMETHODIMP SetDeselected() override { return S_OK; }
    IFACEMETHODIMP GetFieldState(DWORD id, CREDENTIAL_PROVIDER_FIELD_STATE* state,
                               CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* interactive) override {
        if (id != 0) return E_INVALIDARG;
        *state = CPFS_DISPLAY_IN_BOTH; *interactive = CPFIS_NONE; return S_OK;
    }
    IFACEMETHODIMP GetStringValue(DWORD id, PWSTR* value) override {
        return id == 0 ? SHStrDupW(L"Remote AI", value) : E_INVALIDARG;
    }
    IFACEMETHODIMP GetBitmapValue(DWORD, HBITMAP*) override { return E_NOTIMPL; }
    IFACEMETHODIMP GetCheckboxValue(DWORD, BOOL*, PWSTR*) override { return E_NOTIMPL; }
    IFACEMETHODIMP GetSubmitButtonValue(DWORD, DWORD*) override { return E_NOTIMPL; }
    IFACEMETHODIMP GetComboBoxValueCount(DWORD, DWORD*, DWORD*) override { return E_NOTIMPL; }
    IFACEMETHODIMP GetComboBoxValueAt(DWORD, DWORD, PWSTR*) override { return E_NOTIMPL; }
    IFACEMETHODIMP SetStringValue(DWORD, PCWSTR) override { return E_NOTIMPL; }
    IFACEMETHODIMP SetCheckboxValue(DWORD, BOOL) override { return E_NOTIMPL; }
    IFACEMETHODIMP SetComboBoxSelectedValue(DWORD, DWORD) override { return E_NOTIMPL; }
    IFACEMETHODIMP CommandLinkClicked(DWORD) override { return E_NOTIMPL; }
    IFACEMETHODIMP GetUserSid(PWSTR* sid) override { return SHStrDupW(sid_.c_str(), sid); }
    IFACEMETHODIMP GetSerialization(CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* response,
        CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* result, PWSTR* text,
        CREDENTIAL_PROVIDER_STATUS_ICON* icon) override {
        *response = CPGSR_NO_CREDENTIAL_NOT_FINISHED; *result = {}; *text = nullptr; *icon = CPSI_NONE;
        if (submitted_) return S_OK;
        submitted_ = true;
        Request request;
        if (!ReadRequest(request, &nonce_)) return S_OK;
        const HRESULT hr = Serialize(request, scenario_, result);
        if (FAILED(hr)) { WriteResult(nonce_, static_cast<NTSTATUS>(0xC0000001L)); return hr; }
        *response = CPGSR_RETURN_CREDENTIAL_FINISHED;
        return S_OK;
    }
    IFACEMETHODIMP ReportResult(NTSTATUS status, NTSTATUS, PWSTR* text,
                               CREDENTIAL_PROVIDER_STATUS_ICON* icon) override {
        *text = nullptr; *icon = CPSI_NONE;
        WriteResult(nonce_, status);
        return S_OK;
    }
};

HRESULT CreateCredential(const Request& request, CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario,
                         ICredentialProviderCredential** credential) {
    *credential = new (std::nothrow) Credential(request, scenario);
    return *credential ? S_OK : E_OUTOFMEMORY;
}
