/**
 * Detect a malformed HTML start tag whose missing `>` swallows the next element.
 *
 * Browsers can parse `<img src="a.png" <div>...` leniently, treating the
 * second `<div` as bogus attribute text. That can silently remove intended
 * visual content from a deterministic render. A `<` inside a quoted attribute
 * value is valid and is therefore ignored.
 */
export function hasUnquotedLessThan(attrs: string): boolean {
  let quote: '"' | "'" | null = null;
  for (const ch of attrs) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '<') {
      return true;
    }
  }
  return false;
}

/**
 * Return a compatibility finding for malformed parsed tag attributes.
 */
export function detectSwallowedElement(tagName: string, attrs: string): {
  code: 'unclosed_tag_swallowed_element';
  severity: 'error';
  message: string;
} | null {
  if (!hasUnquotedLessThan(attrs)) return null;
  return {
    code: 'unclosed_tag_swallowed_element',
    severity: 'error',
    message: `<${tagName}> is missing its closing \`>\` before the next \`<\`.`,
  };
}
