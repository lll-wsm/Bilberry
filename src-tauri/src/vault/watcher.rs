use notify::{Event, RecursiveMode, Watcher};

pub struct FileWatcher {
    _watcher: Option<notify::RecommendedWatcher>,
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

        Ok(FileWatcher {
            _watcher: Some(watcher),
        })
    }
}

impl Drop for FileWatcher {
    fn drop(&mut self) {
        // A notify backend can panic inside its own `Drop` implementation if
        // its event-loop thread has already exited (the kqueue backend
        // unwraps when sending its shutdown message). An uncaught panic here
        // would unwind through the Tauri IPC handler, cross the C/WebKit FFI
        // boundary and abort the entire app — this is what made "open file"
        // crash instantly. Catch it so a dead watcher is merely discarded.
        if let Some(watcher) = self._watcher.take() {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
                drop(watcher);
            }));
        }
    }
}
