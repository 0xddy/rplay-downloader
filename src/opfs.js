const TEMP_PREFIX = 'rplay-download-';

export async function createTempFile(taskId, extension) {
  const root = await navigator.storage.getDirectory();
  const tempName = `${TEMP_PREFIX}${taskId}.${extension}.part`;
  await root.removeEntry(tempName).catch(() => {});
  const handle = await root.getFileHandle(tempName, { create: true });
  return { root, tempName, handle };
}

export async function removeTempFile(temp) {
  if (!temp?.tempName) return;
  const root = temp.root || await navigator.storage.getDirectory();
  await root.removeEntry(temp.tempName).catch(() => {});
}

export async function cleanupStaleFiles() {
  try {
    const root = await navigator.storage.getDirectory();
    for await (const [name] of root.entries()) {
      if (name.startsWith(TEMP_PREFIX)) await root.removeEntry(name).catch(() => {});
    }
  } catch (error) {
    console.warn('[RPlay] 清理 OPFS 临时文件失败:', error);
  }
}
