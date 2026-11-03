use url::Url;

pub(super) fn base_from_socket(socket: &str) -> Option<String> {
    let mut url = Url::parse(socket).ok()?;
    if url.scheme() != "wss" || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let path = url.path().strip_suffix("/device-switch")?.to_owned();
    url.set_scheme("https").ok()?;
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

pub(super) fn package_url(base: &str, official: &str) -> Option<String> {
    let source = Url::parse(official).ok()?;
    if source.scheme() != "https"
        || !source.username().is_empty()
        || source.password().is_some()
        || source.query().is_some()
        || source.fragment().is_some()
        || source.port().is_some()
    {
        return None;
    }
    let path = match source.host_str()? {
        "github.com" => release_path(source.path())?,
        "api.github.com" => asset_path(source.path())?,
        _ => return None,
    };
    let mut url = Url::parse(base).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    url.set_path(&format!(
        "{}/update-packages/{path}",
        url.path().trim_end_matches('/')
    ));
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

fn asset_path(path: &str) -> Option<String> {
    let id = path.strip_prefix("/repos/piperhex/remoteai/releases/assets/")?;
    let number = id.parse::<i64>().ok()?;
    (number > 0 && number.to_string() == id).then(|| format!("assets/{id}"))
}

fn release_path(path: &str) -> Option<String> {
    let path = path.strip_prefix("/piperhex/remoteai/releases/download/")?;
    let (tag, name) = path.split_once('/')?;
    let version = semver::Version::parse(tag.trim_start_matches('v')).ok()?;
    if !version.pre.is_empty()
        || !version.build.is_empty()
        || name.is_empty()
        || name.len() > 200
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return None;
    }
    Some(path.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_assets_use_the_server_cache_without_a_github_lookup() {
        let base = "https://example.test/api";
        let official = "https://api.github.com/repos/piperhex/remoteai/releases/assets/652496018";
        assert_eq!(
            package_url(base, official).unwrap(),
            "https://example.test/api/update-packages/assets/652496018"
        );
        for rejected in [
            official.replace("piperhex", "elsewhere"),
            official.replace("api.github.com", "api.github.com.evil.test"),
            official.replace("https:", "http:"),
            official.replace("/652496018", "/0"),
            official.replace("/652496018", "/01"),
            official.replace("/652496018", "/-1"),
            official.replace("/652496018", "/9223372036854775808"),
            format!("{official}/extra"),
            format!("{official}?token=secret"),
            format!("{official}#fragment"),
            official.replace("api.github.com", "user:secret@api.github.com"),
        ] {
            assert!(package_url(base, &rejected).is_none(), "{rejected}");
        }
    }
    #[test]
    fn mirror_is_scoped_to_official_stable_assets_and_configured_server() {
        let base = base_from_socket("wss://example.test/api/device-switch").unwrap();
        let official = "https://github.com/piperhex/remoteai/releases/download/v1.2.3/app.exe";
        assert_eq!(
            package_url(&base, official).unwrap(),
            "https://example.test/api/update-packages/v1.2.3/app.exe"
        );
        assert!(package_url(&base, &official.replace("piperhex", "elsewhere")).is_none());
        assert!(package_url(&base, &official.replace("v1.2.3", "v1.2.3-beta")).is_none());
        assert!(base_from_socket("ws://example.test/device-switch").is_none());
    }
}
