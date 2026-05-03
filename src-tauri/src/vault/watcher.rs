use notify::{Event, RecursiveMode, Watcher};
use std::sync::mpsc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

#[allow(dead_code)]
pub struct FileWatcher {
    _handle: thread::JoinHandle<()>,
    running: Arc<AtomicBool>,
}

#[allow(dead_code)]
impl FileWatcher {
    /// Start watching a directory. Returns a receiver for file events and a handle.
    pub fn start(path: &str) -> Result<(mpsc::Receiver<Event>, Self), String> {
        let (tx, rx) = mpsc::channel();
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let watch_path = path.to_string();
        let handle = thread::spawn(move || {
            let mut watcher = match notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            }) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("Failed to create watcher: {}", e);
                    return;
                }
            };

            if let Err(e) = watcher.watch(std::path::Path::new(&watch_path), RecursiveMode::Recursive) {
                eprintln!("Failed to start watching: {}", e);
                return;
            }

            // Keep the watcher alive until stopped
            while running_clone.load(Ordering::Relaxed) {
                thread::sleep(std::time::Duration::from_millis(100));
            }

            let _ = watcher;
        });

        Ok((rx, FileWatcher { _handle: handle, running }))
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}
