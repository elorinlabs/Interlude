use serde::Serialize;
use tauri::{menu::MenuItemKind, AppHandle, Runtime};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MenuEntry {
    pub id: String,
    pub text: String,
    pub enabled: bool,
    pub checked: bool,
    pub separator: bool,
    pub children: Vec<MenuEntry>,
}

impl MenuEntry {
    pub(super) fn allows(&self, id: &str) -> bool {
        self.enabled
            && ((self.id == id && self.children.is_empty() && !self.separator)
                || self.children.iter().any(|child| child.allows(id)))
    }
}

pub(super) fn read<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<MenuEntry>, String> {
    let menu = super::super::build_menu(app).map_err(|error| error.to_string())?;
    convert(menu.items().map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

fn convert<R: Runtime>(items: Vec<MenuItemKind<R>>) -> tauri::Result<Vec<MenuEntry>> {
    items.into_iter().map(convert_item).collect()
}

fn convert_item<R: Runtime>(item: MenuItemKind<R>) -> tauri::Result<MenuEntry> {
    let mut entry = MenuEntry {
        id: item.id().as_ref().to_string(),
        text: String::new(),
        enabled: false,
        checked: false,
        separator: false,
        children: Vec::new(),
    };
    match item {
        MenuItemKind::MenuItem(item) => {
            entry.text = item.text()?;
            entry.enabled = item.is_enabled()?;
        }
        MenuItemKind::Check(item) => {
            entry.text = item.text()?;
            entry.enabled = item.is_enabled()?;
            entry.checked = item.is_checked()?;
        }
        MenuItemKind::Submenu(item) => {
            entry.text = item.text()?;
            entry.enabled = item.is_enabled()?;
            entry.children = convert(item.items()?)?;
        }
        _ => entry.separator = true,
    }
    entry.text = entry.text.replace("&&", "&");
    Ok(entry)
}

#[cfg(test)]
mod tests {
    use super::MenuEntry;

    fn entry(id: &str, enabled: bool, children: Vec<MenuEntry>) -> MenuEntry {
        MenuEntry {
            id: id.into(),
            text: id.into(),
            enabled,
            children,
            checked: false,
            separator: false,
        }
    }

    #[test]
    fn only_enabled_leaf_actions_are_allowed() {
        let menu = entry("provider", true, vec![entry("model", true, vec![])]);
        assert!(menu.allows("model"));
        assert!(!menu.allows("provider"));
        assert!(!menu.allows("unknown"));
        let disabled = entry("provider", false, vec![entry("model", true, vec![])]);
        assert!(!disabled.allows("model"));
    }
}
