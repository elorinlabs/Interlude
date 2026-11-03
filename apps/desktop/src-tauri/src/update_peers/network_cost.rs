//! Unknown network cost is treated conservatively when the user selected unmetered networks only.
#[cfg(windows)]
pub(super) fn unmetered() -> bool {
    use windows::Networking::Connectivity::{NetworkCostType, NetworkInformation};
    (|| {
        let profile = NetworkInformation::GetInternetConnectionProfile().ok()?;
        let cost = profile.GetConnectionCost().ok()?;
        Some(
            cost.NetworkCostType().ok()? == NetworkCostType::Unrestricted
                && !cost.Roaming().ok()?
                && !cost.OverDataLimit().ok()?,
        )
    })()
    .unwrap_or(false)
}

#[cfg(target_os = "linux")]
pub(super) fn unmetered() -> bool {
    std::process::Command::new("nmcli")
        .args(["-t", "-f", "GENERAL.METERED", "device", "show"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .is_some_and(|output| {
            let value = String::from_utf8_lossy(&output.stdout);
            value
                .lines()
                .any(|line| line.ends_with(":no") || line.ends_with(":guess-no"))
                && !value
                    .lines()
                    .any(|line| line.ends_with(":yes") || line.ends_with(":guess-yes"))
        })
}

#[cfg(not(any(windows, target_os = "linux")))]
pub(super) fn unmetered() -> bool {
    false
}
