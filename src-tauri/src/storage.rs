use std::fs;
use std::io::{self, Write};
use std::path::Path;

pub fn read_project(path: &Path) -> io::Result<String> {
    fs::read_to_string(path)
}

pub fn write_project(path: &Path, contents: &str, previous: Option<&str>) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "Project must have a parent folder",
        )
    })?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(contents.as_bytes())?;
    temporary.as_file().sync_all()?;

    match previous {
        None => {
            temporary
                .persist_noclobber(path)
                .map_err(|error| error.error)?;
        }
        Some(expected) => {
            let metadata = fs::symlink_metadata(path)?;
            if !metadata.file_type().is_file() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Project is not a regular file",
                ));
            }
            if read_project(path)? != expected {
                return Err(io::Error::other(
                    "Project changed outside littleKanban. Your changes are not saved.",
                ));
            }
            temporary
                .as_file()
                .set_permissions(metadata.permissions())?;
            temporary.persist(path).map_err(|error| error.error)?;
        }
    }
    Ok(())
}
