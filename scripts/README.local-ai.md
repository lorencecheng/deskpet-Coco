# 🤖 本地轻量 AI 模型（离线 · 免配置）

DeskPet Coco 支持**完全离线、免费、无需 API Key** 的本地 AI。装好一次，以后永久免配置。

## 它是怎么工作的

App 内置了一个「本地模型自动托管」：只要你的电脑上有
`llama-server.exe` + 一个轻量 `.gguf` 模型（都放在 `%APPDATA%\DeskPet Coco\local-ai`），
右键 →「🧠 AI 设置」→ 点「**🤖 用本地模型（离线·免配置）**」，
App 就会自动启动模型服务并切换到本地后端，**不用填任何接口地址或 Key**。

> 模型跑在你自己电脑上：免费、断网也能用、隐私最好（数据不出本机）。

## 一键安装（Windows，约 400MB，只需一次）

用 PowerShell 运行（`deskpet-coco/scripts/fetch-local-model.ps1`）：

```powershell
cd <deskpet-coco目录>
powershell -ExecutionPolicy Bypass -File .\scripts\fetch-local-model.ps1
```

脚本会自动：
1. 从 `hf-mirror.com` 下载 **Qwen2.5-0.5B-Instruct** 量化模型（约 400MB，国内可直连）；
2. 获取并解压 **llama.cpp**（MIT 开源）最新 Windows CPU 版 `llama-server.exe`；
3. 全部放到 `%APPDATA%\DeskPet Coco\local-ai`。

完成后重新打开 App → 右键 →「🧠 AI 设置」→ 点「🤖 用本地模型」即可启用。

## 手动安装（进阶）

不想用脚本，也可以手动把这两个文件放进 `local-ai` 目录：

| 需要 | 来源 | 说明 |
|---|---|---|
| `llama-server.exe` | [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases) | 选 `-bin-win-cpu-x64` 的 zip，解压出 `llama-server.exe` 及 dll |
| `*.gguf` | [Qwen2.5-0.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF) | 推荐 `qwen2.5-0.5b-instruct-q4_k_m.gguf`（~400MB） |

App 会在 `%APPDATA%\DeskPet Coco\local-ai` 递归查找 `llama-server.exe` 和一个 `.gguf` 文件。

## 常见问题

- **很慢 / 转半天？** 0.5B 模型在普通 CPU 上足够跑几句俏皮话；首次启动加载模型会稍慢（几秒），之后正常。
- **想换更强的模型？** 可换 `Qwen1.5-1.8B` 等更大的 `.gguf`，但会更吃内存、更慢。
- **不用本地模型了？** 在「🧠 AI 设置」里关掉即可，完全不影响程序。
- **找不到模型？** 确认 `llama-server.exe` 和 `.gguf` 都在 `local-ai` 目录下（含子目录均可），再重开 App。
