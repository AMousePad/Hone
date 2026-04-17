export function makeSection(title: string): HTMLElement {
  const section = document.createElement("div");
  section.className = "hone-settings-section";
  const h3 = document.createElement("h3");
  h3.textContent = title;
  section.appendChild(h3);
  return section;
}

export function makeDescription(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "hone-section-description";
  p.textContent = text;
  return p;
}

export function makeSubtabBar(
  tabs: Array<{ id: string; label: string }>,
  initialId: string,
  onSwitch: (id: string) => void
): { bar: HTMLElement; activeId: string; setActive: (id: string) => void } {
  let activeId = initialId;
  const bar = document.createElement("div");
  bar.className = "hone-subtab-bar";

  function render() {
    bar.innerHTML = "";
    for (const tab of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `hone-subtab-btn${tab.id === activeId ? " active" : ""}`;
      btn.textContent = tab.label;
      btn.addEventListener("click", () => {
        if (tab.id === activeId) return;
        activeId = tab.id;
        render();
        onSwitch(tab.id);
      });
      bar.appendChild(btn);
    }
  }

  render();

  return {
    bar,
    get activeId() { return activeId; },
    setActive(id: string) { activeId = id; render(); },
  };
}

export function generatePromptId(): string {
  return "prompt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
