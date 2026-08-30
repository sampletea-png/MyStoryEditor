const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "S",
  "STRIKE",
  "DEL",
  "HR",
  "SPAN",
]);

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) {
    return;
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

export function sanitizePastedHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toUnwrap: Element[] = [];
  let node = walker.nextNode();
  while (node) {
    const el = node as Element;
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("color");
    el.removeAttribute("face");
    el.removeAttribute("size");
    if (!ALLOWED_TAGS.has(el.tagName)) {
      toUnwrap.push(el);
    }
    node = walker.nextNode();
  }
  for (const el of toUnwrap) {
    unwrapElement(el);
  }
  return doc.body.innerHTML;
}

export const ALLOWED_MARKS = new Set(["bold", "italic", "strike"]);
