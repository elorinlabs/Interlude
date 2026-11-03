pub(super) fn normalize(provider: &mut Option<String>, models: &mut Vec<String>) {
    *provider = Some("codex".into());
    models.clear();
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn retired_provider_and_model_selection_are_reset() {
        let mut provider = Some("antigravity".into());
        let mut models = vec!["Claude".into()];
        normalize(&mut provider, &mut models);
        assert_eq!(provider.as_deref(), Some("codex"));
        assert!(models.is_empty());
    }

    #[test]
    fn default_and_codex_configs_are_stable_after_normalizing() {
        for mut provider in [None, Some("codex".into())] {
            let mut models = Vec::new();
            normalize(&mut provider, &mut models);
            normalize(&mut provider, &mut models);
            assert_eq!(provider.as_deref(), Some("codex"));
            assert!(models.is_empty());
        }
    }
}
