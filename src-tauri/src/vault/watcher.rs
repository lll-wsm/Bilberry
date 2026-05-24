use notify::{Event, RecursiveMode, Watcher};

pub struct FileWatcher {
    _watcher: notify::RecommendedWatcher,
}

impl FileWatcher {
    /// Start watching a directory and call the callback on every event.
    pub fn start<F>(path: &str, mut callback: F) -> Result<Self, String>
    where
        F: FnMut(Result<Event, notify::Error>) + Send + 'static,
    {
        let mut watcher = notify::recommended_watcher(move |res| {
            callback(res);
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(std::path::Path::new(path), RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to start watching: {}", e))?;

        Ok(FileWatcher { _watcher: watcher })
    }
}

