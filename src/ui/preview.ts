import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { PreviewPath, MessageRole } from "../types";

function formatPreviewPath(path: PreviewPath): string {
  if (path.kind === "pipeline") return "Sequential";
  if (path.kind === "proposal") return `Agent ${path.proposalIndex + 1}`;
  return "Aggregator";
}

export function showPreviewModal(
  ctx: SpindleFrontendContext,
  path: PreviewPath,
  stageIndex: number,
  messages: Array<{ role: MessageRole; content: string }>,
  diagnostics: Array<{ message: string }>
): void {
  const overlay = document.createElement("div");
  overlay.className = "hone-preview-overlay";

  const modal = document.createElement("div");
  modal.className = "hone-preview-modal";

  const header = document.createElement("div");
  header.className = "hone-preview-modal__header";
  const title = document.createElement("h3");
  title.textContent = `Preview: ${formatPreviewPath(path)} stage ${stageIndex + 1}`;
  header.appendChild(title);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "hone-preview-modal__close";
  closeBtn.textContent = "\u00d7";
  closeBtn.setAttribute("aria-label", "Close preview");
  closeBtn.addEventListener("click", () => overlay.remove());
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = document.createElement("div");
  body.className = "hone-preview-modal__body";

  if (diagnostics.length > 0) {
    const diag = document.createElement("div");
    diag.className = "hone-preview-modal__diagnostics";
    const diagTitle = document.createElement("h4");
    diagTitle.textContent = "Macro Diagnostics";
    diag.appendChild(diagTitle);
    const ul = document.createElement("ul");
    for (const d of diagnostics) {
      const li = document.createElement("li");
      li.textContent = d.message;
      ul.appendChild(li);
    }
    diag.appendChild(ul);
    body.appendChild(diag);
  }

  for (const m of messages) {
    const msgCard = document.createElement("div");
    msgCard.className = "hone-preview-msg";
    const roleLabel = document.createElement("div");
    roleLabel.className = "hone-preview-msg__role";
    roleLabel.textContent = m.role;
    const contentPre = document.createElement("pre");
    contentPre.className = "hone-preview-msg__content";
    contentPre.textContent = m.content;
    msgCard.appendChild(roleLabel);
    msgCard.appendChild(contentPre);
    body.appendChild(msgCard);
  }

  modal.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "hone-preview-modal__footer";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "hone-settings-btn";
  copyBtn.textContent = "Copy JSON";
  copyBtn.addEventListener("click", async () => {
    const json = JSON.stringify(messages, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy JSON"), 1500);
    } catch {
      copyBtn.textContent = "Copy failed";
    }
  });
  footer.appendChild(copyBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}
