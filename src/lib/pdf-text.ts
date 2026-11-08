import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Text of a PDF with its paragraphs rebuilt.
 *
 * PDF text comes out one printed line at a time. A line that falls clearly short of the usual line
 * width ends a paragraph (so do headings); other lines are joined. A word broken after a hyphen is
 * joined with the hyphen kept. Bare page numbers are dropped. Returns '' for scanned PDFs with no text layer.
 */
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((p) =>
    p.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !/^\d{1,4}$/.test(l))
  );
  const lengths = pages.flat().map((l) => l.length).sort((a, b) => a - b);
  if (!lengths.length) return '';
  const typical = lengths[Math.floor(lengths.length * 0.75)]; // most full lines are at least this long
  const short = typical * 0.8;

  const paragraphs: string[] = [];
  let cur = '';
  for (const line of pages.flat()) {
    if (!cur) cur = line;
    else if (/[A-Za-zА-Яа-я]-$/.test(cur)) cur = cur + line; // keep the hyphen: "two-minute" is more common than a soft break
    else cur = `${cur} ${line}`;
    if (line.length < short) {
      paragraphs.push(cur);
      cur = '';
    }
  }
  if (cur) paragraphs.push(cur);
  return paragraphs.join('\n\n');
}
