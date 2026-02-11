# Solana 自动化交互脚本

本项目包含两个主要的自动化脚本，用于在 Solana 链上进行交互操作。

## 1. 环境准备

### 安装依赖
确保已安装 Node.js，然后运行：
```bash
npm install
```

### 配置文件 `.env`
复制 `.env.example` 或新建 `.env` 文件，填入以下配置：

```ini
# (必填) 钱包私钥，多个私钥用逗号分隔
SOL_PRIVATE_KEYS=YourPrivateKey1,YourPrivateKey2...

# (必填) Jupiter Ultra API Key (可在 https://portal.jup.ag 免费获取)
JUP_API_KEY=YourJupiterApiKey

# (可选) SOCKS5 代理，格式 IP:PORT:USER:PASS，多个用逗号分隔
# 脚本会自动将代理按顺序分配给钱包
SOL_PROXIES=127.0.0.1:1080:user:pass,127.0.0.1:1081:user:pass

# (可选) RPC 节点，默认使用公共主网节点
SOL_RPC_URL=https://api.mainnet-beta.solana.com

# (可选) USDC 代币地址
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

---

## 2. 脚本功能说明

### A. Jupiter Swap 自动交易 (`jup_swap.js`)

**功能：**
- 自动执行 **SOL -> USDC -> SOL** 的循环交易。
- **防止磨损**：每次先将 SOL 换成 USDC，等待 10 秒确认后，再将全部 USDC 换回 SOL。
- **随机金额**：每次随机交换 `0.01` - `0.03` SOL。
- **随机间隔**：
  - 白天 (8:00-23:00): 2 - 5 分钟/次
  - 夜间 (23:00-8:00): 15 - 30 分钟/次
- **API 支持**：使用 Jupiter Ultra API (`v1/ultra`)，无需 RPC 即可提交交易。
- **代理支持**：支持 SOCKS5 代理，每个钱包绑定独立代理 IP，隔离 API 请求和链上交互。

**运行命令：**
```bash
node jup_swap.js
```

### B. 钱包自转账 (`soltransfer.js`)

**功能：**
- 执行钱包内的 **自转账 (Self-Transfer)** 操作，即自己给自己转账。
- 活跃账户：用于维持链上活跃度。
- **随机金额**：转账金额为当前余额的 `1%` - `30%`。
- **Gas 预留**：自动预留 `0.005` SOL 作为 Gas 费，防止余额耗尽。
- **随机间隔**：
  - 白天: 30秒 - 3分钟/次 (4% 概率跳过)
  - 夜间: 8 - 20 分钟/次 (35% 概率跳过)
- **代理支持**：同样支持 SOCKS5 代理，RPC 连接走代理。

**运行命令：**
```bash
node soltransfer.js
```

---

## 3. 注意事项
1. **私钥安全**：`.env` 文件包含私钥，请勿上传到 GitHub 或公开分享。
2. **代理配置**：如果配置了代理，脚本会优先使用代理连接 RPC 和 Jupiter API。
3. **资金预留**：请确保钱包中有少量 SOL (建议 > 0.01 SOL) 以支付 Gas 费。
