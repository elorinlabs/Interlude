pub(super) fn restore<T: Clone>(
    changes: &[(String, T)],
    mut read: impl FnMut(&str) -> Result<Option<T>, String>,
    mut write: impl FnMut(&str, Option<&T>) -> Result<(), String>,
) -> Result<Vec<(String, Option<T>)>, String> {
    let before = changes
        .iter()
        .map(|(id, _)| read(id).map(|value| (id.clone(), value)))
        .collect::<Result<Vec<_>, _>>()?;
    for (index, (id, value)) in changes.iter().enumerate() {
        if let Err(error) = write(id, Some(value)) {
            rollback(&before[..=index], &mut write)?;
            return Err(error);
        }
    }
    Ok(before)
}

pub(super) fn rollback<T>(
    before: &[(String, Option<T>)],
    mut write: impl FnMut(&str, Option<&T>) -> Result<(), String>,
) -> Result<(), String> {
    let mut failed = false;
    for (id, value) in before.iter().rev() {
        if write(id, value.as_ref()).is_err() {
            failed = true;
        }
    }
    if failed {
        Err("backupRollback".into())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, collections::BTreeMap};
    #[test]
    fn a_mid_restore_failure_restores_prior_entries_and_removes_new_entries() {
        let store = RefCell::new(BTreeMap::from([("a".to_string(), "old".to_string())]));
        let mut failed = false;
        let changes = vec![("a".into(), "new".into()), ("b".into(), "new-b".into())];
        let result = restore(
            &changes,
            |id| Ok(store.borrow().get(id).cloned()),
            |id, value| {
                if id == "b" && value.is_some() && !failed {
                    failed = true;
                    return Err("vault-locked".into());
                }
                match value {
                    Some(value) => {
                        store.borrow_mut().insert(id.into(), value.clone());
                    }
                    None => {
                        store.borrow_mut().remove(id);
                    }
                }
                Ok(())
            },
        );
        assert_eq!(result.unwrap_err(), "vault-locked");
        assert_eq!(
            store.into_inner(),
            BTreeMap::from([("a".into(), "old".into())])
        );
    }
    #[test]
    fn read_failure_never_starts_writing_and_rollback_failures_are_explicit() {
        let mut writes = 0;
        assert!(restore(
            &[("a".into(), 1)],
            |_| Err("read-locked".into()),
            |_, _| {
                writes += 1;
                Ok(())
            }
        )
        .is_err());
        assert_eq!(writes, 0);
        assert_eq!(
            rollback::<u8>(&[("a".into(), None)], |_, _| Err("locked".into())),
            Err("backupRollback".into())
        );
    }
}
