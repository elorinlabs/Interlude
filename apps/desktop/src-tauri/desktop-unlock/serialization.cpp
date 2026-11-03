#include "unlock.h"
#include <wincred.h>
#include <ntsecapi.h>

static HRESULT AuthenticationPackage(ULONG* package) {
    HANDLE lsa = nullptr;
    NTSTATUS status = LsaConnectUntrusted(&lsa);
    if (status < 0) return HRESULT_FROM_WIN32(LsaNtStatusToWinError(status));
    char name[] = "Negotiate";
    LSA_STRING text{static_cast<USHORT>(sizeof(name) - 1), sizeof(name), name};
    status = LsaLookupAuthenticationPackage(lsa, &text, package);
    LsaDeregisterLogonProcess(lsa);
    return status < 0 ? HRESULT_FROM_WIN32(LsaNtStatusToWinError(status)) : S_OK;
}

HRESULT Serialize(Request& request, CREDENTIAL_PROVIDER_USAGE_SCENARIO scenario,
                  CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* result) {
    *result = {};
    if (scenario != CPUS_LOGON && scenario != CPUS_UNLOCK_WORKSTATION) return E_NOTIMPL;
    const auto provider = request.username.substr(0, request.username.find(L'\\'));
    const bool identity = _wcsicmp(provider.c_str(), L"MicrosoftAccount") == 0
        || _wcsicmp(provider.c_str(), L"AzureAD") == 0;
    const DWORD flags = CRED_PACK_PROTECTED_CREDENTIALS | (identity ? CRED_PACK_ID_PROVIDER_CREDENTIALS : 0);
    DWORD size = 0;
    CredPackAuthenticationBufferW(flags, request.username.data(), request.password.data(), nullptr, &size);
    if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || !size || size > MaxRequestBytes) return E_FAIL;
    auto buffer = static_cast<BYTE*>(CoTaskMemAlloc(size));
    if (!buffer) return E_OUTOFMEMORY;
    HRESULT hr = E_FAIL;
    if (CredPackAuthenticationBufferW(flags, request.username.data(), request.password.data(), buffer, &size)) {
        // CredPack defaults to KerbInteractiveLogon. Legacy unlock scenarios require the unlock message type.
        if (!identity && scenario == CPUS_UNLOCK_WORKSTATION && size >= sizeof(KERB_INTERACTIVE_UNLOCK_LOGON))
            reinterpret_cast<KERB_INTERACTIVE_UNLOCK_LOGON*>(buffer)->Logon.MessageType = KerbWorkstationUnlockLogon;
        hr = AuthenticationPackage(&result->ulAuthenticationPackage);
    }
    if (FAILED(hr)) { SecureZeroMemory(buffer, size); CoTaskMemFree(buffer); return hr; }
    result->clsidCredentialProvider = ProviderId;
    result->cbSerialization = size;
    result->rgbSerialization = buffer;
    return S_OK;
}
