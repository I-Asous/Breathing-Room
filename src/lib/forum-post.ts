/** A forum post is one message: the first line is the title, the rest is the body. */

export function splitPost(content: string): { title: string; body: string } {
  const text = content.replace(/\r\n/g, '\n').trim()
  const breakAt = text.indexOf('\n')
  if (breakAt === -1) return { title: text, body: '' }
  return {
    title: text.slice(0, breakAt).trim(),
    body: text.slice(breakAt + 1).trim(),
  }
}

export function composePost(title: string, body: string): string {
  const heading = title.trim()
  const rest = body.trim()
  if (!heading) return ''
  return rest ? `${heading}\n\n${rest}` : heading
}
