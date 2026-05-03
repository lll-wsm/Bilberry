import { loadDataFile, saveDataFile } from "./persistence";

const FILE_NAME = "file-encodings.json";
type EncodingMap = Record<string, string>;

export async function getEncoding(filePath: string): Promise<string | null> {
  const map = await loadDataFile<EncodingMap>(FILE_NAME, {});
  return map[filePath] ?? null;
}

export async function setEncoding(filePath: string, encoding: string): Promise<void> {
  const map = await loadDataFile<EncodingMap>(FILE_NAME, {});
  map[filePath] = encoding;
  await saveDataFile(FILE_NAME, map);
}
