export function abortDownloadContext(context) {
  context.controller.abort();
  context.resolveMediaKey?.dispose?.();
  context.prefetcher?.dispose();
  context.input?.dispose();
  context.audioInput?.dispose();
  if (context.output && !['canceled', 'finalized'].includes(context.output.state)) {
    try {
      // Do not await MediaBunny cleanup here. The request must acknowledge the
      // user's cancellation immediately; the pipeline owns final cleanup.
      void Promise.resolve(context.output.cancel()).catch(() => {});
    } catch {
      // A synchronous cleanup failure must not block task cancellation.
    }
  }
  return true;
}
