// A writable file double; the MP4 parser, packet pipeline and muxer remain real.
export function createMemoryOpfs() {
  const files = new Map();
  const root = {
    async removeEntry(name) { files.delete(name); },
    async getFileHandle(name) {
      let bytes = new Uint8Array();
      const handle = {
        async createWritable() {
          return new WritableStream({
            write({ data, position }) {
              if (position + data.length > bytes.length) {
                const expanded = new Uint8Array(position + data.length);
                expanded.set(bytes);
                bytes = expanded;
              }
              bytes.set(data, position);
            },
          });
        },
        async getFile() { return new File([bytes], name); },
      };
      files.set(name, handle);
      return handle;
    },
  };
  return { files, root, navigator: { storage: { getDirectory: async () => root } } };
}
