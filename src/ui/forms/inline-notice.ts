export function showInlineNotice(
  container: HTMLElement,
  message: string,
  timeoutMs = 2000
): void {
  const existing = container.querySelector<HTMLElement>(".hone-inline-notice");
  if (existing) {
    const prevTimer = (existing as HTMLElement & { _honeTimer?: number })._honeTimer;
    if (prevTimer !== undefined) window.clearTimeout(prevTimer);
    existing.remove();
  }

  const el = document.createElement("div");
  el.className = "hone-inline-notice";
  el.textContent = message;
  container.appendChild(el);

  const timer = window.setTimeout(() => {
    el.remove();
  }, timeoutMs);
  (el as HTMLElement & { _honeTimer?: number })._honeTimer = timer;
}
