import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'qwen-image-tool'
export const inject = ['tools', 'commands']

const API_URL =
  process.env.QWEN_IMAGE_API_URL?.trim() ||
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

const MODELS = [
  'qwen-image-3.0-pro',
  'qwen-image-3.0',
  'qwen-image-2.1-pro',
  'qwen-image-2.1-turbo',
]

const DEFAULT_MODEL = process.env.QWEN_IMAGE_MODEL?.trim() || 'qwen-image-2.1-turbo'

function getApiKey() {
  const key =
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.QIANWEN_API_KEY?.trim() ||
    process.env.BAILIAN_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'Missing API key. Set DASHSCOPE_API_KEY (or QIANWEN_API_KEY / BAILIAN_API_KEY), then restart DSH.',
    )
  }
  return key
}

function outputDir() {
  return process.env.QWEN_IMAGE_OUT_DIR?.trim() || resolve(process.cwd(), 'qwen-images')
}

function normalizeSize(size) {
  return String(size).trim().replace(/[x×]/gi, '*')
}

function toImageContent(image) {
  const list = Array.isArray(image) ? image : [image]
  if (list.length === 0) throw new Error('image must not be empty')
  return list.map((url) => ({ image: url }))
}

function defaultOutputPath(prompt) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const slug =
    String(prompt).slice(0, 24).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'image'
  return resolve(outputDir(), `${stamp}-${slug}.png`)
}

async function downloadImage(url, outPath) {
  await mkdir(dirname(outPath), { recursive: true })
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`)
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()))
}

function attachmentToImageRef(block) {
  if (!block || typeof block !== 'object') return null
  if (typeof block.url === 'string' && block.url) return block.url
  if (typeof block.image === 'string' && block.image) return block.image
  if (typeof block.source === 'string' && block.source) return block.source
  const b64 = block.base64 || block.data || block.imageBase64
  if (typeof b64 === 'string' && b64) {
    const mime = block.mimeType || block.mime || 'image/png'
    return b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`
  }
  return null
}

async function generateImage(opts, signal) {
  const apiKey = getApiKey()
  const model = opts.model || DEFAULT_MODEL
  if (!MODELS.includes(model)) {
    throw new Error(`Unsupported model: ${model}. One of: ${MODELS.join(', ')}`)
  }

  const prompt = String(opts.prompt || '').trim()
  if (!prompt) throw new Error('prompt must be a non-empty string')

  const content = []
  if (opts.image != null && opts.image !== '') {
    let imageInput = opts.image
    if (typeof imageInput === 'string' && imageInput.trim().startsWith('[')) {
      try {
        imageInput = JSON.parse(imageInput)
      } catch {
        throw new Error('image looks like a JSON array but failed to parse')
      }
    }
    content.push(...toImageContent(imageInput))
  }
  content.push({ text: prompt })

  const parameters = {
    prompt_extend: true,
    watermark: Boolean(opts.watermark),
  }
  if (opts.size) parameters.size = normalizeSize(String(opts.size))
  if (opts.n != null) {
    const n = Number(opts.n)
    if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error('n must be integer 1..6')
    parameters.n = n
  }
  if (opts.negative_prompt) parameters.negative_prompt = String(opts.negative_prompt)
  if (opts.seed != null) parameters.seed = Number(opts.seed)

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: { messages: [{ role: 'user', content }] },
      parameters,
    }),
    signal: signal ?? AbortSignal.timeout(600_000),
  })

  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      `Qwen-Image API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 400)}`,
    )
  }

  if (!res.ok || json.code || json.error) {
    const msg = json?.message || json?.error?.message || json?.code || `HTTP ${res.status}`
    throw new Error(`Qwen-Image API error: ${msg}`)
  }

  const items = json?.output?.choices?.[0]?.message?.content || []
  const images = items
    .map((c) => c?.image)
    .filter((u) => typeof u === 'string' && u.length > 0)
  if (images.length === 0) {
    throw new Error(`Qwen-Image returned no image URL. Raw: ${text.slice(0, 400)}`)
  }

  const usage = json?.usage || {}
  const firstUrl = images[0]

  let localPath
  if (opts.output_path) {
    localPath = isAbsolute(String(opts.output_path))
      ? String(opts.output_path)
      : resolve(process.cwd(), String(opts.output_path))
  } else if (images.length === 1) {
    localPath = defaultOutputPath(prompt)
  }

  if (localPath) {
    try {
      await downloadImage(firstUrl, localPath)
    } catch {
      localPath = undefined
    }
  }

  return {
    model,
    request_id: json?.request_id,
    url: firstUrl,
    local_path: localPath,
    width: usage.output_width ?? usage.width,
    height: usage.output_height ?? usage.height,
    count: images.length,
    rewrite_status: json?.output?.rewrite_status,
  }
}

function parseCommandInput(rawInput) {
  const s = String(rawInput || '').trim()
  if (!s) return { error: 'missing prompt' }

  const opts = {}
  let rest = s

  const flagRe =
    /^(?:--model|-m)\s+(\S+)|^(?:--size|-s)\s+(\S+)|^(?:--out|-o)\s+(\S+)|^--n\s+(\d+)|^--seed\s+(\d+)|^--no-watermark\b/i

  for (;;) {
    const m = rest.match(flagRe)
    if (!m) break
    if (m[1]) opts.model = m[1]
    else if (m[2]) opts.size = m[2]
    else if (m[3]) opts.output_path = m[3]
    else if (m[4]) opts.n = Number(m[4])
    else if (m[5]) opts.seed = Number(m[5])
    else if (m[0]) opts.watermark = false
    rest = rest.slice(m[0].length).trim()
  }

  const prompt = rest.trim()
  if (!prompt) return { error: 'missing prompt' }
  opts.prompt = prompt
  return { opts }
}

function formatResult(r) {
  const size = r.width && r.height ? `${r.width}x${r.height}` : ''
  const parts = []
  parts.push(
    r.local_path
      ? `Image saved to: ${r.local_path}`
      : `Image generated.`,
  )
  const meta = [size, r.count > 1 ? `${r.count} images` : ''].filter(Boolean).join(' · ')
  if (meta) parts.push(meta)
  if (!r.local_path && r.url) {
    parts.push(`Temporary URL (expires in 24h): ${r.url}`)
  }
  return parts.join('\n')
}

export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: 'qwen_image',
      description:
        'Generate or edit images with Alibaba Bailian Qwen-Image. ' +
        'Use for text-to-image and image-to-image/edit. ' +
        'Saves PNG locally and returns URL. ' +
        'Requires env DASHSCOPE_API_KEY (or QIANWEN_API_KEY).',
      parameters: {
        prompt: {
          type: 'string',
          required: true,
          description: 'Positive prompt describing the desired image.',
        },
        model: {
          type: 'string',
          description: `Model id. Default: ${DEFAULT_MODEL}. One of: ${MODELS.join(', ')}`,
        },
        size: {
          type: 'string',
          description:
            'Output size as WxH or W*H, e.g. 1024*1024. Pixel area within 512*512 .. 2048*2048.',
        },
        n: {
          type: 'number',
          description: 'Number of images, 1-6. Default 1.',
        },
        image: {
          type: 'string',
          description:
            'Optional input image URL or data:image/...;base64,... for I2I. ' +
            'Multiple images: JSON array string. qwen-image-3.0 accepts 1-3 images.',
        },
        negative_prompt: {
          type: 'string',
          description: 'What to avoid. Only supported by qwen-image-3.0 series.',
        },
        seed: {
          type: 'number',
          description: 'Random seed 0..2147483647.',
        },
        watermark: {
          type: 'boolean',
          description: 'Add watermark. Default false.',
        },
        output_path: {
          type: 'string',
          description:
            'Local PNG path. Default: $QWEN_IMAGE_OUT_DIR or ./qwen-images/<timestamp>-<slug>.png',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            model: { type: 'string' },
            request_id: { type: 'string' },
            url: { type: 'string' },
            local_path: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
            count: { type: 'number' },
            rewrite_status: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: formatResult(value) }],
      },
      async execute(args, exec) {
        return generateImage(args, exec?.signal)
      },
    }),
  )

  ctx.commands.register({
    name: 'qwen_image',
    description: 'Qwen-Image: generate image directly (no LLM round-trip)',
    input: {
      hint: '[--model <id>] [--size WxH] [--out path] [--n N] [--seed N] <prompt>',
    },
    handler: async (invocation) => {
      try {
        const parsed = parseCommandInput(invocation.rawInput)
        if (parsed.error) {
          return {
            kind: 'error',
            text:
              'Usage: /qwen_image [--model qwen-image-2.1-turbo] [--size 1024*1024] [--out a.png] <prompt>\n' +
              'Attach an image for image-to-image.',
          }
        }
        const refs = (invocation.attachments || []).map(attachmentToImageRef).filter(Boolean)
        if (refs.length > 0) {
          parsed.opts.image = refs.length === 1 ? refs[0] : refs
        }
        const result = await generateImage(parsed.opts, invocation.signal)
        return { kind: 'success', text: formatResult(result) }
      } catch (e) {
        return { kind: 'error', text: e?.message || String(e) }
      }
    },
  })

  ctx.commands.register({
    name: 'img',
    description: 'Qwen-Image (short alias of /qwen_image)',
    input: {
      hint: '[--model <id>] [--size WxH] [--out path] <prompt>',
    },
    handler: async (invocation) => {
      try {
        const parsed = parseCommandInput(invocation.rawInput)
        if (parsed.error) {
          return {
            kind: 'error',
            text: 'Usage: /img [--size 1024*1024] [--out a.png] <prompt>',
          }
        }
        const refs = (invocation.attachments || []).map(attachmentToImageRef).filter(Boolean)
        if (refs.length > 0) {
          parsed.opts.image = refs.length === 1 ? refs[0] : refs
        }
        const result = await generateImage(parsed.opts, invocation.signal)
        return { kind: 'success', text: formatResult(result) }
      } catch (e) {
        return { kind: 'error', text: e?.message || String(e) }
      }
    },
  })
}
