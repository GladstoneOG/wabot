import { promises as fs } from "fs";
import path from "path";

export const dataDirectory = process.env.VERCEL
  ? path.join("/tmp", "wa-bot")
  : path.join(process.cwd(), "data");

const inMemoryStore = new Map<string, unknown>();

async function ensureDir() {
  try {
    await fs.mkdir(dataDirectory, { recursive: true });
  } catch (error) {
    console.warn("Failed to ensure data directory", error);
  }
}

async function readFromDisk<T>(file: string, fallback: T): Promise<T> {
  try {
    await ensureDir();
    const contents = await fs.readFile(path.join(dataDirectory, file), "utf-8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await writeToDisk(file, fallback);
      return fallback;
    }
    console.warn(`Falling back to memory store for ${file}`, error);
    return (inMemoryStore.get(file) as T | undefined) ?? fallback;
  }
}

async function writeToDisk<T>(file: string, value: T) {
  try {
    await ensureDir();
    await fs.writeFile(
      path.join(dataDirectory, file),
      JSON.stringify(value, null, 2),
      "utf-8"
    );
    inMemoryStore.set(file, value);
  } catch (error) {
    console.warn(`Persisting ${file} failed, keeping in memory`, error);
    inMemoryStore.set(file, value);
  }
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  const value = await readFromDisk<T>(file, fallback);
  inMemoryStore.set(file, value);
  return value;
}

export async function writeJson<T>(file: string, value: T): Promise<void> {
  await writeToDisk(file, value);
}

export function getMemory<T>(file: string, fallback: T): T {
  return (inMemoryStore.get(file) as T | undefined) ?? fallback;
}
