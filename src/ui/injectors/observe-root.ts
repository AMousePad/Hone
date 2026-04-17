export interface ObserveRootOptions {
  findRoot: () => Element | null;
  onMount: (root: Element) => void;
  onMutation?: (root: Element, mutations: MutationRecord[]) => void;
  pollMs?: number;
}

export interface ObserveRootHandle {
  rescan: () => void;
  currentRoot: () => Element | null;
  destroy: () => void;
}

export function observeRoot(opts: ObserveRootOptions): ObserveRootHandle {
  let attachedTo: Element | null = null;
  let observer: MutationObserver | null = null;
  let pollId: number | null = null;

  function detach() {
    if (observer) observer.disconnect();
    observer = null;
    attachedTo = null;
  }

  function attach(root: Element) {
    if (attachedTo === root) return;
    detach();
    attachedTo = root;
    opts.onMount(root);
    if (opts.onMutation) {
      observer = new MutationObserver((mutations) => opts.onMutation!(root, mutations));
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  function tryAttach() {
    const root = opts.findRoot();
    if (!root) return false;
    if (root !== attachedTo) attach(root);
    return true;
  }

  if (!tryAttach()) {
    pollId = window.setInterval(() => {
      if (attachedTo) {
        if (pollId !== null) {
          window.clearInterval(pollId);
          pollId = null;
        }
        return;
      }
      tryAttach();
    }, opts.pollMs ?? 500);
  }

  return {
    rescan() {
      tryAttach();
      if (attachedTo) opts.onMount(attachedTo);
    },
    currentRoot: () => attachedTo,
    destroy() {
      detach();
      if (pollId !== null) {
        window.clearInterval(pollId);
        pollId = null;
      }
    },
  };
}
