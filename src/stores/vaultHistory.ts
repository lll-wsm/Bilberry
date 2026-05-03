import { loadDataFile, saveDataFile } from "./persistence";

const FILE_NAME = "vault-history.json";
const MAX_HISTORY = 5;

export async function loadHistory(): Promise<string[]> {
  const data = await loadDataFile<string[]>(FILE_NAME, []);
  return Array.isArray(data) ? data.slice(0, MAX_HISTORY) : [];
}

export async function addToHistory(path: string): Promise<void> {
  const history = await loadHistory();
  const filtered = history.filter((p) => p !== path);
  await saveDataFile(FILE_NAME, [path, ...filtered].slice(0, MAX_HISTORY));
}

export async function removeFromHistory(path: string): Promise<void> {
  const history = await loadHistory();
  await saveDataFile(FILE_NAME, history.filter((p) => p !== path));
}
