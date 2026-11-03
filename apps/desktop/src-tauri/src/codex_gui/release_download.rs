//! Preserve streaming origin downloads while allowing verified shared packages first.
use super::{
    download, errors, http_client, publish, AppHandle, Asset, GuiError, Path, Progress, Result,
};
use crate::update_peers::packages::Package;

pub(super) struct Request<'a> {
    pub version: &'a str,
    pub asset: &'a Asset,
    pub silent: bool,
}

pub(super) fn shared_download(app: &AppHandle, path: &Path, request: Request<'_>) -> Result<()> {
    let Request {
        version,
        asset,
        silent,
    } = request;
    let mut package = asset.digest.as_deref().and_then(|digest| {
        Package::codex(version, &asset.browser_download_url, digest, asset.size)
    });
    if let Some(package) = &mut package {
        let mut downloaded = 0u64;
        let mut last_percent = 0;
        let bytes = package.read_shared(app, |length, _| {
            downloaded = downloaded.saturating_add(length as u64).min(asset.size);
            let percent = downloaded * 100 / asset.size.max(1);
            if percent > last_percent {
                report(app, downloaded, asset.size, silent);
                last_percent = percent;
            }
        });
        if let Some(bytes) = bytes {
            return std::fs::write(path, bytes.as_slice()).map_err(|error| {
                errors::io("write shared download", error, GuiError::InstallWrite)
            });
        }
    }
    report(app, 0, asset.size, silent);
    download(
        |progress| {
            if !silent {
                publish(app, progress);
            }
        },
        &http_client()?,
        asset,
        path,
    )?;
    if let Some(mut package) = package {
        package.remember_file(app, path);
    }
    Ok(())
}

fn report(app: &AppHandle, downloaded: u64, total: u64, silent: bool) {
    if !silent {
        publish(
            app,
            Progress {
                downloaded,
                total,
                phase: "downloading",
            },
        );
    }
}
