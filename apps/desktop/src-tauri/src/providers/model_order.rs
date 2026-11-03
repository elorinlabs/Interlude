use std::cmp::Ordering;

use super::{group_visible_models, provider_group_model_name};
use crate::models::ProviderProfile;

fn is_separator(character: char) -> bool {
    character.is_whitespace() || matches!(character, '.' | '_' | '-')
}

fn tokens(model: &str) -> Vec<String> {
    let name = model
        .trim()
        .rsplit('/')
        .next()
        .unwrap_or(model)
        .to_lowercase();
    let mut characters = name.chars().peekable();
    let mut tokens = Vec::new();
    while let Some(first) = characters.next() {
        if is_separator(first) {
            continue;
        }
        let numeric = first.is_ascii_digit();
        let mut token = first.to_string();
        while characters
            .peek()
            .is_some_and(|next| !is_separator(*next) && next.is_ascii_digit() == numeric)
        {
            if let Some(next) = characters.next() {
                token.push(next);
            }
        }
        tokens.push(token);
    }
    tokens
}

fn is_numeric(token: &str) -> bool {
    !token.is_empty() && token.bytes().all(|byte| byte.is_ascii_digit())
}

fn compare_token(left: Option<&str>, right: Option<&str>) -> Ordering {
    match (left, right) {
        (None, None) => Ordering::Equal,
        (None, Some(value)) => {
            if is_numeric(value) {
                Ordering::Greater
            } else {
                Ordering::Less
            }
        }
        (Some(value), None) => {
            if is_numeric(value) {
                Ordering::Less
            } else {
                Ordering::Greater
            }
        }
        (Some(left), Some(right)) => compare_value(left, right),
    }
}

fn compare_value(left: &str, right: &str) -> Ordering {
    match (is_numeric(left), is_numeric(right)) {
        (true, true) => {
            // Compare digit strings without integer overflow, newest version first.
            let left = left.trim_start_matches('0');
            let right = right.trim_start_matches('0');
            right.len().cmp(&left.len()).then_with(|| right.cmp(left))
        }
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        (false, false) => left.cmp(right),
    }
}

/// Keep model families together and compare numeric version components newest first.
fn compare_models(left: &str, right: &str) -> Ordering {
    let left_tokens = tokens(left);
    let right_tokens = tokens(right);
    for index in 0..left_tokens.len().max(right_tokens.len()) {
        let order = compare_token(
            left_tokens.get(index).map(String::as_str),
            right_tokens.get(index).map(String::as_str),
        );
        if order != Ordering::Equal {
            return order;
        }
    }
    left.to_lowercase().cmp(&right.to_lowercase())
}

/// Sort a catalog copy while retaining the original model identifiers.
pub(super) fn sort_models(models: &mut [String]) {
    models.sort_by(|left, right| compare_models(left, right));
}

/// Sort official accounts before relays without modifying routing slugs or member order.
pub(super) fn sort_group_models(models: &mut [String], providers: &[ProviderProfile]) {
    let identities: std::collections::HashMap<_, _> = providers
        .iter()
        .flat_map(|provider| {
            let is_relay = crate::aggregate_api::member_account_id(&provider.id).is_none();
            group_visible_models(provider)
                .into_iter()
                .map(move |model| {
                    (
                        provider_group_model_name(provider, model),
                        (is_relay, model),
                    )
                })
        })
        .collect();
    models.sort_by(
        |left, right| match (identities.get(left), identities.get(right)) {
            (Some((left_relay, left_model)), Some((right_relay, right_model))) => left_relay
                .cmp(right_relay)
                .then_with(|| compare_models(left_model, right_model))
                .then_with(|| left.cmp(right)),
            _ => compare_models(left, right),
        },
    );
}
