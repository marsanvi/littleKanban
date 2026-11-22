use littlekanban_lib::storage::write_project;
use std::sync::{Arc, Barrier};
use std::thread;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("synthetic.littlekanban");
    let initial = r#"{"version":1,"name":"Synthetic","tickets":[]}"#;
    let mut both_succeeded = 0;
    let mut one_succeeded = 0;
    let mut neither_succeeded = 0;
    for _ in 0..100 {
        std::fs::write(&path, initial)?;
        let barrier = Arc::new(Barrier::new(2));
        let handles: Vec<_> = ["A", "B"]
            .into_iter()
            .map(|name| {
                let barrier = Arc::clone(&barrier);
                let path = path.clone();
                thread::spawn(move || {
                    let contents = format!(r#"{{"version":1,"name":"{name}","tickets":[]}}"#);
                    barrier.wait();
                    write_project(&path, &contents, Some(initial)).is_ok()
                })
            })
            .collect();
        let successes = handles
            .into_iter()
            .map(|handle| handle.join().expect("writer thread failed"))
            .filter(|success| *success)
            .count();
        match successes {
            2 => both_succeeded += 1,
            1 => one_succeeded += 1,
            _ => neither_succeeded += 1,
        }
    }
    println!("100 simultaneous synthetic writes: both succeeded={both_succeeded}, one succeeded={one_succeeded}, neither succeeded={neither_succeeded}");
    println!("Both succeeding means a check/write race allowed one edit to replace the other.");
    Ok(())
}
