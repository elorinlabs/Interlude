use super::*;
use std::io::Read;

fn run(root: &Path, path: &str, action: Action) -> Result<Change> {
    perform(Request {
        cwd: execution_path(root),
        path: path.into(),
        action,
    })
}

#[test]
fn creates_copies_moves_renames_and_deletes_complete_folders() {
    let root = tempfile::tempdir().unwrap();
    run(
        root.path(),
        ".",
        Action::CreateFolder {
            name: "中文 folder".into(),
        },
    )
    .unwrap();
    run(
        root.path(),
        "中文 folder",
        Action::CreateFile {
            name: "hello.txt".into(),
        },
    )
    .unwrap();
    fs::write(root.path().join("中文 folder/hello.txt"), "hello").unwrap();
    let copy = run(
        root.path(),
        "中文 folder",
        Action::Copy {
            directory: ".".into(),
        },
    )
    .unwrap();
    assert_eq!(
        fs::read_to_string(Path::new(&copy.path).join("hello.txt")).unwrap(),
        "hello"
    );
    assert!(copy.path.ends_with("中文 folder (copy)"));
    run(
        root.path(),
        ".",
        Action::CreateFolder {
            name: "destination".into(),
        },
    )
    .unwrap();
    run(
        root.path(),
        "中文 folder",
        Action::Move {
            directory: "destination".into(),
        },
    )
    .unwrap();
    assert!(!root.path().join("中文 folder").exists());
    run(
        root.path(),
        "destination/中文 folder",
        Action::Rename {
            name: "renamed".into(),
        },
    )
    .unwrap();
    assert!(root.path().join("destination/renamed/hello.txt").is_file());
    run(root.path(), "destination", Action::Delete).unwrap();
    assert!(!root.path().join("destination").exists());
    assert!(Path::new(&copy.path).join("hello.txt").exists());
}

#[test]
fn refuses_overwrites_root_mutations_and_recursive_destinations() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir_all(root.path().join("one/child")).unwrap();
    fs::write(root.path().join("keep"), "original").unwrap();
    for action in [
        Action::CreateFile {
            name: "keep".into(),
        },
        Action::CreateFolder {
            name: "keep".into(),
        },
        Action::Rename {
            name: "other".into(),
        },
        Action::Delete,
        Action::Move {
            directory: "one".into(),
        },
    ] {
        assert!(run(root.path(), ".", action).is_err());
    }
    assert!(run(
        root.path(),
        "one",
        Action::Rename {
            name: "keep".into()
        }
    )
    .is_err());
    for action in [
        Action::Copy {
            directory: "one/child".into(),
        },
        Action::Move {
            directory: "one".into(),
        },
    ] {
        assert!(matches!(
            run(root.path(), "one", action),
            Err(Error::Descendant)
        ));
    }
    assert_eq!(
        fs::read_to_string(root.path().join("keep")).unwrap(),
        "original"
    );
}

#[test]
fn rejects_traversal_external_sources_and_invalid_names() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret"), "keep").unwrap();
    assert!(run(root.path(), "..", Action::Delete).is_err());
    assert!(run(
        root.path(),
        &execution_path(&outside.path().join("secret")),
        Action::Delete
    )
    .is_err());
    for name in [
        "",
        ".",
        "..",
        "../outside",
        "nested/name",
        "a\\b",
        "NUL.txt",
        "a:",
        "a.",
        "a\nb",
    ] {
        assert!(
            run(root.path(), ".", Action::CreateFile { name: name.into() }).is_err(),
            "{name}"
        );
    }
    assert_eq!(
        fs::read_to_string(outside.path().join("secret")).unwrap(),
        "keep"
    );
}

#[test]
fn zipped_folder_contains_unicode_binary_and_empty_directories_without_a_project_artifact() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir_all(root.path().join("folder/empty")).unwrap();
    fs::write(root.path().join("folder/中文.bin"), [0, 255, 1, 2]).unwrap();
    let canonical = root.path().canonicalize().unwrap();
    let (file, name) = archive(&canonical, "folder", 4096).unwrap();
    assert_eq!(name, "folder.zip");
    let mut zip = zip::ZipArchive::new(file).unwrap();
    assert!(zip.by_name("folder/empty/").unwrap().is_dir());
    let mut bytes = Vec::new();
    zip.by_name("folder/中文.bin")
        .unwrap()
        .read_to_end(&mut bytes)
        .unwrap();
    assert_eq!(bytes, [0, 255, 1, 2]);
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    assert!(matches!(
        archive(&canonical, "folder", 3),
        Err(Error::TooLarge)
    ));
}

#[test]
fn deserializes_only_supported_actions() {
    let request: Request = serde_json::from_value(serde_json::json!({
        "cwd": "C:/project", "path": "folder", "action": "rename", "name": "renamed"
    }))
    .unwrap();
    assert!(matches!(request.action, Action::Rename { .. }));
    assert!(serde_json::from_value::<Request>(serde_json::json!({
        "cwd": "C:/project", "path": "folder", "action": "execute", "command": "anything"
    }))
    .is_err());
}

#[cfg(unix)]
#[test]
fn rejects_archive_names_that_become_traversal_on_windows() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("folder")).unwrap();
    fs::write(root.path().join(r"folder/..\..\escape"), "contents").unwrap();
    assert!(matches!(
        archive(&root.path().canonicalize().unwrap(), "folder", 4096),
        Err(Error::Name)
    ));
}

#[cfg(unix)]
#[test]
fn rejects_symlinks_in_recursive_copy_delete_and_archive() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("folder")).unwrap();
    fs::write(outside.path().join("secret"), "keep").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("folder/link")).unwrap();
    assert!(run(
        root.path(),
        "folder",
        Action::Copy {
            directory: ".".into()
        }
    )
    .is_err());
    assert!(run(root.path(), "folder", Action::Delete).is_err());
    assert!(archive(&root.path().canonicalize().unwrap(), "folder", 4096).is_err());
    assert_eq!(
        fs::read_to_string(outside.path().join("secret")).unwrap(),
        "keep"
    );
}
