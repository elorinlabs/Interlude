use crate::pet_dock::DockState;

const PET_DOCK_RENDERER: &str = include_str!("pet_dock.js");
const PET_DOCK_ART: &[u8] = include_bytes!("pet_dock/platform.png");

fn is_pet_surface_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if url.scheme() != "app" {
        return false;
    }
    url.path() == "/avatar-overlay"
        || url
            .query_pairs()
            .any(|(key, route)| key == "initialRoute" && route == "/avatar-overlay")
}

/// Uses the existing managed channel; a display preference never launches or restarts Codex.
pub(crate) fn sync_pet_dock(snapshot: Option<&Value>) -> Result<DockState, String> {
    let Some(port) = read_session().port else {
        return Ok(DockState::WaitingForCodex);
    };
    let Ok(targets) = list_targets(port) else {
        return Ok(DockState::WaitingForCodex);
    };
    let snapshot = snapshot.filter(|_| runtime_enhancements_enabled());
    let mut state = DockState::WaitingForPet;
    for target in targets
        .into_iter()
        .filter(|target| is_pet_surface_url(&target.url))
    {
        let mut session = CdpSession::connect(&target, port)?;
        let Some(snapshot) = snapshot else {
            session.evaluate("window.__interludePetDock?.destroy(); true")?;
            continue;
        };
        let installed = session.evaluate("window.__interludePetDock?.version === 15")?;
        if installed.as_bool() != Some(true) {
            session.evaluate(PET_DOCK_RENDERER)?;
            let image = format!("data:image/png;base64,{}", BASE64.encode(PET_DOCK_ART));
            let image = serde_json::to_string(&image).map_err(|error| error.to_string())?;
            session.evaluate(&format!(
                "window.__interludePetDock.update({snapshot}, {image}); true"
            ))?;
        } else {
            session.evaluate(&format!(
                "window.__interludePetDock.update({snapshot}); true"
            ))?;
        }
        let visible = session.evaluate("window.__interludePetDock.inspect().dockVisible")?;
        if visible.as_bool() == Some(true) {
            state = DockState::Active;
        }
    }
    if snapshot.is_none() {
        state = DockState::WaitingForCodex;
    }
    Ok(state)
}

#[cfg(test)]
mod pet_surface_tests {
    use super::*;

    #[test]
    fn targets_only_the_official_pet_and_excludes_composition_and_main_windows() {
        assert!(is_pet_surface_url(
            "app://-/index.html?initialRoute=%2Favatar-overlay"
        ));
        assert!(is_pet_surface_url("app://-/avatar-overlay"));
        for url in [
            "app://-/index.html",
            "app://-/avatar-overlay-composition-surface.html",
            "app://-/index.html?initialRoute=%2Favatar-overlay%2Fpet",
            "https://example.com/avatar-overlay",
        ] {
            assert!(!is_pet_surface_url(url));
        }
    }
}
