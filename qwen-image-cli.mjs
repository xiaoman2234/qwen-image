#!/usr/bin/env node
/**
 * Standalone CLI for Qwen-Image (same API as the DSH plugin).
 *
 *   DASHSCOPE_API_KEY=sk-... node qwen-image-cli.mjs "a red flower" out.png
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const API_URL =
  process.env.QWEN_IMAGE_API_URL?.trim() ||
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

const prompt = process.argv[2]
const out = resolve(process.argv[3] || 'qwen-image-out.png')
const model = process.env.QWEN_IMAGE_MODEL || 'qwen-image-2.1-turbo'
const size = process.env.QWEN_IMAGE_SIZE || '1024*1024'
const apiKey =
  process.env.DASHSCOPE_API_KEY ||
  process.env.QIANWEN_API_KEY ||
  process.env.BAILIAN_API_KEY

if (!prompt) {
  console.error('Usage: node qwen-image-cli.mjs "<prompt>" [out.png]')
  process.exit(1)
}
if (!apiKey) {
  console.error('Set DASHSCOPE_API_KEY first')
  process.exit(1)
}

const body = {
  model,
  input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
  parameters: { size, n: 1, prompt_extend: true },
}

const res = await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify(body),
})
const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  console.error('Non-JSON response', res.status, text.slice(0, 400))
  process.exit(1)
}
if (!res.ok || json.error || json.code) {
  console.error('API error', json.message || json.error || json.code || res.status)
  process.exit(1)
}

const url = json?.output?.choices?.[0]?.message?.content?.[0]?.image
if (!url) {
  console.error('No image URL in response:', text.slice(0, 400))
  process.exit(1)
}

await mkdir(dirname(out), { recursive: true })
const img = await fetch(url)
await writeFile(out, Buffer.from(await img.arrayBuffer()))
console.log(JSON.stringify({ out, request_id: json.request_id }, null, 2))
