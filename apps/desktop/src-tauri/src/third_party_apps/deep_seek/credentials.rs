use super::{child, object, text, ProviderProfile, SyncError, SyncResult, Value, API_KEY_REF};

const DOCUMENT_VERSION: u64 = 1;

pub(super) fn update(config: &mut Value, provider: Option<&ProviderProfile>) -> SyncResult<()> {
    let root = object(config)?;
    if let Some(version) = root.get(text("version")) {
        if version.as_u64() != Some(DOCUMENT_VERSION) {
            return Err(SyncError::UnsupportedVersion);
        }
    }
    // Upgrade the pre-release flat credential layout without losing other keys.
    if !root.is_empty()
        && root
            .values()
            .all(|value| value.as_str().is_some_and(|s| !s.is_empty()))
    {
        let flat = std::mem::take(root);
        root.insert(text("refs"), Value::Mapping(flat));
    }
    root.remove(text(API_KEY_REF));
    root.insert(text("version"), Value::Number(DOCUMENT_VERSION.into()));
    let refs = child(root, "refs")?;
    match provider {
        Some(provider) => {
            refs.insert(text(API_KEY_REF), text(&provider.api_key));
        }
        None => {
            refs.remove(text(API_KEY_REF));
        }
    }
    Ok(())
}
