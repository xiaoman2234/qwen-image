# dsh-qwen-image

**简体中文** | [English](./README.en.md)

给 **DeepSeek Harness（DSH）** 用的阿里云百炼 **千问生图（Qwen-Image）** 插件。

- 斜杠命令：`/img`、`/qwen_image` —— **直接出图**，不经过大模型对话
- 工具：`qwen_image` —— 对话里让模型自己调用
- 自动把 PNG 存到本地，并返回临时图片链接

---

## 运行要求

- Node.js 20 或更高
- 已安装 DSH（自带 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-commands`）
- 阿里云百炼 API Key

---

## 环境变量

| 变量 | 是否必填 | 说明 |
|------|----------|------|
| `DASHSCOPE_API_KEY` | 必填* | 百炼 API Key（`sk-` 开头） |
| `QIANWEN_API_KEY` | 备选 | 也可以用这个 |
| `BAILIAN_API_KEY` | 备选 | 也可以用这个 |
| `QWEN_IMAGE_OUT_DIR` | 否 | 默认保存目录（不填则用 `./qwen-images`） |
| `QWEN_IMAGE_MODEL` | 否 | 默认模型（不填则用 `qwen-image-2.1-turbo`） |
| `QWEN_IMAGE_API_URL` | 否 | 自定义接口地址 |

\* 三个 Key 变量里填任意一个即可。

**Windows 示例（PowerShell）：**

```powershell
[Environment]::SetEnvironmentVariable("DASHSCOPE_API_KEY", "你的Key", "User")
[Environment]::SetEnvironmentVariable("QWEN_IMAGE_OUT_DIR", "D:\images\qwen", "User")
# 改完环境变量后要重开终端，并重启 DSH
```

---

## 安装

```sh
# 桌面版 profile
dsh plugin --profile desktop add /本机路径/dsh-qwen-image

# Web 版 profile
dsh plugin --profile web add /本机路径/dsh-qwen-image
```

装完后**完全退出并重启 DSH**。

本地开发（不打包）时可用：

```sh
dsh web --patch ./cordis.yml
```

---

## 怎么用

在输入框直接输入：

```text
/img 窗台上晒太阳的橘猫，水彩风格
/qwen_image --size 1024*1024 --out out.png 一朵简笔画小红花
/qwen_image --model qwen-image-3.0 --n 2 两种配色的 logo 草图
```

### 可选参数（写在提示词前面）

| 参数 | 说明 |
|------|------|
| `--model <模型名>` | 见下方模型表 |
| `--size 宽x高` | 例如 `1024*1024`（注意用星号 `*`） |
| `--out <路径>` | 保存到指定文件 |
| `--n <张数>` | 1～6 张 |
| `--seed <数字>` | 固定随机种子，便于复现 |
| `--no-watermark` | 不加水印 |

提交时若带了**图片附件**，会按**图生图**处理。

对话里也可以让模型调用工具名 **`qwen_image`** 画图。

### 支持的模型

| 模型名 | 说明 |
|--------|------|
| `qwen-image-2.1-turbo` | 默认，速度快、性价比高 |
| `qwen-image-2.1-pro` | 2.1 Pro |
| `qwen-image-3.0` | 3.0 标准 |
| `qwen-image-3.0-pro` | 3.0 Pro（可能消耗更多额度） |

---

## 接口说明（给开发者）

- 地址：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- 鉴权：`Authorization: Bearer $DASHSCOPE_API_KEY`
- 请求体：`{ model, input.messages[].content[{image?},{text}], parameters }`
- 返回图片链接：`output.choices[0].message.content[0].image`（约 **24 小时**有效，请尽快下载）
- **不要**把 `qwen-image-*` 当成聊天模型走 `/chat/completions`（会报 400）

---

## 命令行自测（可选，不经过 DSH）

```sh
DASHSCOPE_API_KEY=你的Key node qwen-image-cli.mjs "一朵小红花" out.png
```

---

## 常见问题

| 现象 | 处理 |
|------|------|
| `/img` 变成普通聊天消息 | 插件没装进当前 profile，或没重启 DSH |
| 提示缺 API Key | 设置 `DASHSCOPE_API_KEY` 后重启 DSH |
| 提示免费额度用尽 | 换 `qwen-image-2.1-turbo` 等，或开通付费 |
| 图片存到哪里了 | 默认在 `QWEN_IMAGE_OUT_DIR`；命令结果里也有完整路径 |

---

## 许可

MIT