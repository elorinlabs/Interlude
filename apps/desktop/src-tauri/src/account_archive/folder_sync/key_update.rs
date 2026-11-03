pub(super) fn save(
    next: &[u8],
    previous: Option<&[u8]>,
    mut write_key: impl FnMut(Option<&[u8]>) -> Result<(), String>,
    write_config: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    write_key(Some(next))?;
    if let Err(error) = write_config() {
        write_key(previous)?;
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::save;
    #[test]
    fn a_failed_configuration_write_restores_the_original_key() {
        for original in [None, Some(vec![1; 32])] {
            let mut stored = original.clone();
            let result = save(
                &[2; 32],
                original.as_deref(),
                |key| {
                    stored = key.map(|k| k.to_vec());
                    Ok(())
                },
                || Err("disk-full".into()),
            );
            assert_eq!(result, Err("disk-full".into()));
            assert_eq!(stored, original);
        }
    }
    #[test]
    fn successful_configuration_commits_the_new_key_and_key_failure_stops_the_commit() {
        let mut stored = None;
        save(
            &[3; 32],
            None,
            |key| {
                stored = key.map(|k| k.to_vec());
                Ok(())
            },
            || Ok(()),
        )
        .unwrap();
        assert_eq!(stored, Some(vec![3; 32]));
        let mut committed = false;
        assert!(save(
            &[3; 32],
            None,
            |_| Err("keyring-locked".into()),
            || {
                committed = true;
                Ok(())
            }
        )
        .is_err());
        assert!(!committed);
    }
}
