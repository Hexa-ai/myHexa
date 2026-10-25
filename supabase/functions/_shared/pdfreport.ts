// PDF A4 des rapports (pdf-lib + police Inter). Même modèle de blocs que le mail (report-run) :
// en-tête avec logo, blocs les uns sous les autres, saut de page sans couper un bloc court, pied de page « page n / N ».
// deno-lint-ignore-file no-explicit-any
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import { interFonts } from './svgchart.ts'

export interface PdfCell {
  t: string
  size?: number
  bold?: boolean
  color?: string
  right?: boolean
  dot?: string
}
export type PdfPart =
  | { k: 'img'; img: { png: Uint8Array; w: number; h: number } }
  | { k: 'imgs'; list: { png: Uint8Array; w: number; h: number }[]; caption?: string }
  | { k: 'rows'; head?: string[]; rows: PdfCell[][]; widths: number[] }
  | { k: 'text'; t: string; color?: string; size?: number; bold?: boolean }
  | { k: 'legend'; items: { color: string; label: string }[]; extra?: string }
  | { k: 'url'; url: string; bytes?: Uint8Array | null }
export interface PdfBlock {
  title: string
  sub?: string
  parts: PdfPart[]
}
export interface PdfDoc {
  brand: string // « myHexa · Serpol »
  title: string // nom de la box / du projet
  subtitle: string // nom du rapport — période
  note?: string // comparaison
  footer: string
  logo?: Uint8Array | null
  blocks: PdfBlock[]
}

const W = 595.28
const H = 841.89
const M = 40
const CW = W - 2 * M
const TOP = H - 64 // sous l'en-tête courant
const BOTTOM = 48
const GAP = 14

const hex = (c?: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? '')
  const n = m ? parseInt(m[1], 16) : 0x111827
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
// caractères absents du sous-ensemble latin d'Inter
const clean = (s: string) => s.replace(/→/g, '->').replace(/[\u2009\u202f]/g, ' ').replace(/[^\u0000-\u024f\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u20ac·]/g, '')

async function embedAny(doc: PDFDocument, b: Uint8Array): Promise<PDFImage | null> {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return await doc.embedPng(b)
    if (b[0] === 0xff && b[1] === 0xd8) return await doc.embedJpg(b)
  } catch (_) {
    /* image illisible : ignorée */
  }
  return null
}

export async function buildPdf(d: PdfDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [r400, r600] = await interFonts()
  const reg = await doc.embedFont(r400, { subset: true })
  const bold = await doc.embedFont(r600, { subset: true })
  doc.setTitle(clean(`${d.title} — ${d.subtitle}`))
  doc.setProducer('myHexa (Hexa-AI)')
  doc.setCreator('myHexa')
  const logo = d.logo ? await embedAny(doc, d.logo) : null

  let page!: PDFPage
  let y = 0
  const text = (s: string, x: number, yy: number, size: number, f: PDFFont, color?: string) =>
    page.drawText(clean(s), { x, y: yy, size, font: f, color: hex(color) })
  const width = (s: string, size: number, f: PDFFont) => f.widthOfTextAtSize(clean(s), size)
  const fit = (s: string, max: number, size: number, f: PDFFont) => {
    let t = clean(s)
    if (f.widthOfTextAtSize(t, size) <= max) return t
    while (t.length > 1 && f.widthOfTextAtSize(t + '…', size) > max) t = t.slice(0, -1)
    return t + '…'
  }
  const wrap = (s: string, max: number, size: number, f: PDFFont) => {
    const out: string[] = []
    for (const para of clean(s).split('\n')) {
      let line = ''
      for (const word of para.split(' ')) {
        const tryL = line ? line + ' ' + word : word
        if (f.widthOfTextAtSize(tryL, size) > max && line) {
          out.push(line)
          line = word
        } else line = tryL
      }
      out.push(line)
    }
    return out
  }

  const newPage = (first = false) => {
    page = doc.addPage([W, H])
    if (first) return
    // en-tête courant (pages 2+)
    let x = M
    if (logo) {
      let h = 18
      let w = (logo.width / logo.height) * h
      if (w > 90) {
        h = (90 / w) * h
        w = 90
      }
      page.drawImage(logo, { x, y: H - 34, width: w, height: h })
      x += w + 10
    }
    text(fit(`${d.title} · ${d.subtitle}`, W - M - x, 9, reg), x, H - 28, 9, reg, '#6b7280')
    page.drawLine({ start: { x: M, y: H - 42 }, end: { x: W - M, y: H - 42 }, thickness: 0.5, color: hex('#e5e7eb') })
    y = TOP
  }
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage()
  }

  // ---- page 1 : en-tête complet ----
  newPage(true)
  y = H - M
  if (logo) {
    const h = 40
    let w = (logo.width / logo.height) * h
    let hh = h
    if (w > 160) {
      hh = (160 / w) * h
      w = 160
    }
    page.drawImage(logo, { x: W - M - w, y: y - hh, width: w, height: hh })
  }
  const tMax = CW - (logo ? 175 : 0)
  text(fit(d.brand.toUpperCase(), tMax, 8, bold), M, y - 9, 8, bold, '#00a88a')
  y -= 34
  for (const l of wrap(d.title, tMax, 20, bold)) {
    text(l, M, y, 20, bold)
    y -= 24
  }
  for (const l of wrap(d.subtitle, tMax, 11, reg)) {
    text(l, M, y + 4, 11, reg, '#374151')
    y -= 15
  }
  if (d.note) {
    text(d.note, M, y + 4, 9, reg, '#6b7280')
    y -= 13
  }
  y -= 8
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: hex('#00a88a') })
  y -= GAP + 4

  // ---- hauteur d'une partie (pour ne pas couper un bloc court) ----
  const imgH = (im: { w: number; h: number }) => (Math.min(CW, im.w * 0.86) / im.w) * im.h
  const partH = (p: PdfPart): number => {
    switch (p.k) {
      case 'img':
        return imgH(p.img) + 4
      case 'imgs': {
        const per = Math.min(3, p.list.length)
        const w = Math.min(165, (CW - (per - 1) * 8) / per)
        const rows = Math.ceil(p.list.length / per)
        return rows * ((w / p.list[0].w) * p.list[0].h + 6) + (p.caption ? 12 : 0)
      }
      case 'rows':
        return (p.head ? 16 : 0) + p.rows.reduce((a, r) => a + Math.max(...r.map((c) => c.size ?? 10)) + 8, 0)
      case 'text':
        return wrap(p.t, CW, p.size ?? 10, p.bold ? bold : reg).length * ((p.size ?? 10) + 4) + 2
      case 'legend':
        return 16
      case 'url':
        return p.bytes ? 160 : 0
    }
  }

  for (const b of d.blocks) {
    const head = 18 + (b.sub ? 11 : 0)
    const total = head + b.parts.reduce((a, p) => a + partH(p), 0) + GAP
    // un bloc qui tient sur une page n'est jamais coupé ; sinon : titre + 1re partie au moins
    ensure(total <= TOP - BOTTOM ? total : head + (b.parts[0] ? partH(b.parts[0]) : 0))
    if (b.title) {
      text(fit(b.title, CW, 11, bold), M, y - 11, 11, bold)
      y -= 16
    }
    if (b.sub) {
      text(fit(b.sub, CW, 8, reg), M, y - 7, 8, reg, '#6b7280')
      y -= 11
    }
    y -= 2
    for (const p of b.parts) {
      switch (p.k) {
        case 'img': {
          const w = Math.min(CW, p.img.w * 0.86)
          const h = imgH(p.img)
          ensure(h + 4)
          const im = await doc.embedPng(p.img.png)
          page.drawImage(im, { x: M, y: y - h, width: w, height: h })
          y -= h + 4
          break
        }
        case 'imgs': {
          const per = Math.min(3, p.list.length)
          const w = Math.min(165, (CW - (per - 1) * 8) / per)
          for (let i = 0; i < p.list.length; i += per) {
            const row = p.list.slice(i, i + per)
            const h = (w / row[0].w) * row[0].h
            ensure(h + 6)
            const x0 = M + (CW - (row.length * w + (row.length - 1) * 8)) / 2
            for (let j = 0; j < row.length; j++) {
              const im = await doc.embedPng(row[j].png)
              page.drawImage(im, { x: x0 + j * (w + 8), y: y - h, width: w, height: (w / row[j].w) * row[j].h })
            }
            y -= h + 6
          }
          if (p.caption) {
            text(p.caption, M + (CW - width(p.caption, 8, reg)) / 2, y - 7, 8, reg, '#6b7280')
            y -= 12
          }
          break
        }
        case 'rows': {
          const xs: number[] = []
          let acc = M
          for (const f of p.widths) {
            xs.push(acc)
            acc += f * CW
          }
          if (p.head) {
            ensure(16)
            p.head.forEach((h, i) => {
              const cw = p.widths[i] * CW - 4
              const t = fit(h.toUpperCase(), cw, 7, bold)
              text(t, i ? xs[i] + p.widths[i] * CW - width(t, 7, bold) : xs[i], y - 9, 7, bold, '#6b7280')
            })
            y -= 16
          }
          for (const r of p.rows) {
            const size = Math.max(...r.map((c) => c.size ?? 10))
            const rh = size + 8
            ensure(rh)
            page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.4, color: hex('#eef0f3') })
            r.forEach((c, i) => {
              const s = c.size ?? 10
              const f = c.bold ? bold : reg
              let x = xs[i]
              const cw = p.widths[i] * CW - 6
              const base = y - (rh + s * 0.7) / 2
              if (c.dot) {
                page.drawCircle({ x: x + 4, y: base + s * 0.35, size: 3.6, color: hex(c.dot) })
                x += 12
              }
              const t = fit(c.t, cw - (c.dot ? 12 : 0), s, f)
              text(t, c.right ? xs[i] + p.widths[i] * CW - width(t, s, f) : x, base, s, f, c.color)
            })
            y -= rh
          }
          y -= 2
          break
        }
        case 'text': {
          const s = p.size ?? 10
          const f = p.bold ? bold : reg
          for (const l of wrap(p.t, CW, s, f)) {
            ensure(s + 4)
            text(l, M, y - s, s, f, p.color)
            y -= s + 4
          }
          y -= 2
          break
        }
        case 'legend': {
          ensure(16)
          let x = M
          for (const it of p.items) {
            const t = fit(it.label, CW / 2, 8, reg)
            if (x + 12 + width(t, 8, reg) > W - M) break
            page.drawRectangle({ x, y: y - 9, width: 7, height: 7, color: hex(it.color) })
            text(t, x + 10, y - 9, 8, reg, '#374151')
            x += 22 + width(t, 8, reg)
          }
          if (p.extra && x + width(p.extra, 8, bold) < W - M) text(p.extra, x, y - 9, 8, bold)
          y -= 16
          break
        }
        case 'url': {
          const im = p.bytes ? await embedAny(doc, p.bytes) : null
          if (!im) break
          const h = 150
          const w = Math.min(CW, (im.width / im.height) * h)
          ensure(h + 10)
          page.drawImage(im, { x: M, y: y - (w / im.width) * im.height, width: w, height: (w / im.width) * im.height })
          y -= (w / im.width) * im.height + 10
          break
        }
      }
    }
    y -= GAP
  }

  // ---- pieds de page ----
  const pages = doc.getPages()
  pages.forEach((pg: PDFPage, i: number) => {
    page = pg
    page.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: hex('#e5e7eb') })
    text(fit(d.footer, CW - 60, 7, reg), M, 22, 7, reg, '#9ca3af')
    const n = `${i + 1} / ${pages.length}`
    text(n, W - M - width(n, 7, reg), 22, 7, reg, '#9ca3af')
  })
  return await doc.save()
}
