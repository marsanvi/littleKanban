use littlekanban_lib::storage::{read_project, write_project};

#[test]
fn sequential_external_change_is_not_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("project.littlekanban");
    let initial = r#"{"version":1,"name":"Trip","tickets":[]}"#;
    write_project(&path, initial, None).unwrap();
    let opened = read_project(&path).unwrap();
    let external = r#"{"version":1,"name":"External","tickets":[]}"#;
    std::fs::write(&path, external).unwrap();
    let local = r#"{"version":1,"name":"Trip","tickets":[{"title":"Pack"}]}"#;
    assert!(write_project(&path, local, Some(&opened)).is_err());
    assert_eq!(read_project(&path).unwrap(), external);
}
