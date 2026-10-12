# dsh-qwen-image

[简体中文](./README.md) | **English**

DSH (DeepSeek Harness) plugin for Alibaba Bailian **Qwen-Image** text-to-image / image-to-image.

- Slash commands: `/qwen_image`, `/img` — run generation **without** an LLM round-trip
- Tool: `qwen_image` — for the agent/model to call in chat
- Saves PNG locally and returns a temporary URL

## Requirements

- Node.js >= 20
- DSH with `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-commands`
- Bailian / DashScope API key

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DASHSCOPE_API_KEY` | yes* | Bailian API key (`sk-...`) |
| `QIANWEN_API_KEY` | alt | Also accepted |
| `BAILIAN_API_KEY` | alt | Also accepted |
| `QWEN_IMAGE_OUT_DIR` | no | Default output directory (default: `./qwen-images`) |
| `QWEN_IMAGE_MODEL` | no | Default model (default: `qwen-image-2.1-turbo`) |
| `QWEN_IMAGE_API_URL` | no | Override API endpoint |

\* One of the three key variables.

## Install

```sh
dsh plugin --profile web add /path/to/dsh-qwen-image
# or
dsh plugin --profile desktop add /path/to/dsh-qwen-image
```

Restart DSH after install or code changes.

Local development without packaging:

```sh
dsh web --patch ./cordis.yml
```

## Usage

```text
/img a ginger cat on a windowsill, watercolor
/qwen_image --size 1024*1024 --out out.png a small red flower
/qwen_image --model qwen-image-3.0 --n 2 two logo sketches
```

Flags (before the prompt):

- `--model <id>`
- `--size WxH` — e.g. `1024*1024`
- `--out <path>`
- `--n <count>` — 1–6
- `--seed <n>`
- `--no-watermark`

Image attachments enable image-to-image.

The model may also call the `qwen_image` tool in chat.

### Models

| Model id | Notes |
|----------|-------|
| `qwen-image-2.1-turbo` | Default |
| `qwen-image-2.1-pro` | 2.1 Pro |
| `qwen-image-3.0` | 3.0 standard |
| `qwen-image-3.0-pro` | 3.0 Pro |

## API notes

- Endpoint: `POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- Auth: `Authorization: Bearer $DASHSCOPE_API_KEY`
- Result URL expires in ~24h; download ASAP
- Do **not** use `qwen-image-*` as a chat-completions model (HTTP 400)

## Standalone CLI

```sh
DASHSCOPE_API_KEY=sk-... node qwen-image-cli.mjs "a red flower" out.png
```

## License

MIT