# Solana 自动转账脚本使用说明

本项目包含 Python 和 JavaScript 两个版本的自动转账脚本。任选其一运行即可。

## 1. 核心配置 (必须步骤)

在运行任何脚本之前，必须先配置钱包私钥。

1. 打开项目根目录下的 `.env` 文件。
2. 将占位符替换为您真实的 Solana 钱包私钥 (**Base58 格式字符串**)。
   > **注意**：请务必删除等号后面的中文字符 (如 "这里填钱包A...")，直接粘贴私钥字符串。

   ```ini
   # 正确示例
   SOL_WALLET_A_PRIVATE_KEY=5M... (你的私钥字符串)
   SOL_WALLET_B_PRIVATE_KEY=2p... (你的私钥字符串)
   
   # RPC 节点 (可选，默认主网)
   SOL_RPC_URL=https://api.mainnet-beta.solana.com
   ```
3. 保存文件。

---

## 2. 运行 JavaScript 版本 (推荐)

该版本无需激活虚拟环境，依赖已安装在 `node_modules` 中。

**命令：**
```bash
node sol_auto_transfer_env.js
```

---

## 3. 运行 Python 版本

该版本依赖 `solders` 和 `solana` 库，建议使用虚拟环境运行。

**命令：**
```powershell
.\venv\Scripts\python.exe sol_auto_transfer_env.py
```

## 功能说明

- **互转逻辑**：脚本启动后立即执行一次转账，随后每 **10分钟** 循环执行一次。
- **方向切换**：A -> B，下次 B -> A，交替进行。
- **金额随机**：每次转账金额在 `0.005` 到 `0.01` SOL 之间随机。
