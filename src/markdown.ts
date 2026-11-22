import { marked } from "marked";
import DOMPurify from "dompurify";

export function renderMarkdown(markdown: string): string {
  const html = marked(markdown) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "strong", "em", "code", "pre", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "a"],
    ALLOWED_ATTR: ["href", "title"],
    KEEP_CONTENT: true,
  });
}
