import "dotenv/config";
import bs58 from "bs58";
import fetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
    Keypair,
    VersionedTransaction,
    LAMPORTS_PER_SOL,
    Connection,
} from "@solana/web3.js";

// =======================
// 配置
// =======================

const RPC_URL = process.env.SOL_RPC_URL || "https://api.mainnet-beta.solana.com";
const USDC_MINT = process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP_API_KEY = process.env.JUP_API_KEY || "";

// Jupiter Ultra API 端点
const JUP_BASE = "https://api.jup.ag/ultra/v1";

// ======== 调度配置 ========
const DAY_HOURS = { start: 8, end: 23 };
const DAY_INTERVAL_MIN_MS = 2 * 60 * 1000;
const DAY_INTERVAL_MAX_MS = 5 * 60 * 1000;
const NIGHT_INTERVAL_MIN_MS = 15 * 60 * 1000;
const NIGHT_INTERVAL_MAX_MS = 30 * 60 * 1000;

// =======================
// 账户加载
// =======================

const rawKeys = process.env.SOL_PRIVATE_KEYS || "";
const keyList = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);

if (keyList.length === 0) {
    throw new Error("❌ .env 中 SOL_PRIVATE_KEYS 为空");
}

if (!JUP_API_KEY) {
    throw new Error("❌ .env 中 JUP_API_KEY 为空，请到 portal.jup.ag 获取");
}

// 解析 SOCKS5 代理列表
const rawProxies = process.env.SOL_PROXIES || "";
const proxyList = rawProxies.split(",").map((p) => p.trim()).filter(Boolean);

function buildProxyAgent(proxyStr) {
    const [host, port, user, pass] = proxyStr.split(":");
    return new SocksProxyAgent(`socks5h://${user}:${pass}@${host}:${port}`);
}

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0"
];

// 封装钱包，每个绑定代理和 Connection
const workers = keyList.map((k, i) => {
    const kp = Keypair.fromSecretKey(bs58.decode(k));
    const proxyAgent = proxyList.length > 0
        ? buildProxyAgent(proxyList[i % proxyList.length])
        : null;
    const conn = new Connection(RPC_URL, {
        commitment: "confirmed",
        fetchMiddleware: proxyAgent
            ? (info, init, fetch_) => fetch_(info, { ...init, agent: proxyAgent })
            : undefined,
    });
    return {
        index: i + 1,
        keypair: kp,
        label: `W${i + 1}`,
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        proxyAgent,
        connection: conn,
    };
});

// =======================
// 工具函数
// =======================

function isDaytime() {
    const h = new Date().getHours();
    return h >= DAY_HOURS.start && h < DAY_HOURS.end;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// =======================
// Jupiter Ultra API
// =======================

async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { ...options, timeout: 15000 });
            if (res.ok) return await res.json();
            if (res.status === 429) {
                console.warn(`[Retry] 429 限频, 等待后重试...`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            const body = await res.text();
            throw new Error(`API ${res.status}: ${body}`);
        } catch (e) {
            if (i === retries - 1) {
                console.error(`[Retry] 请求失败 (${e.message}), 达到最大重试次数`);
                throw e;
            }
            console.warn(`[Retry] 请求失败 (${e.message}), 第 ${i + 1} 次重试...`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// 步骤 1：获取 order（报价 + 未签名交易）
async function getOrder(worker, inputMint, outputMint, amount) {
    const url = `${JUP_BASE}/order`
        + `?inputMint=${inputMint}`
        + `&outputMint=${outputMint}`
        + `&amount=${amount}`
        + `&taker=${worker.keypair.publicKey.toString()}`;
    return await fetchWithRetry(url, {
        headers: {
            "User-Agent": worker.userAgent,
            "x-api-key": JUP_API_KEY,
        },
        agent: worker.proxyAgent,
    });
}

// 步骤 2：签名后提交执行
async function executeOrder(worker, signedTransaction, requestId) {
    const url = `${JUP_BASE}/execute`;
    return await fetchWithRetry(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": worker.userAgent,
            "x-api-key": JUP_API_KEY,
        },
        body: JSON.stringify({ signedTransaction, requestId }),
        agent: worker.proxyAgent,
    });
}

// =======================
// 主逻辑
// =======================

async function executeSwap(worker) {
    const now = new Date().toLocaleString();
    console.log(`[${now}] 🚀 [${worker.label}] 开始执行 SOL -> USDC -> SOL 循环交易...`);

    try {
        // --- 阶段 1: SOL -> USDC ---
        // 随机交换 0.01 到 0.03 SOL
        const amountSOL = (randInt(10, 30) / 1000).toFixed(4);
        const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

        console.log(`[${worker.label}] 1️⃣ 正在 Swap SOL -> USDC (${amountSOL} SOL)...`);

        // 1. 获取 order
        const order1 = await getOrder(worker, SOL_MINT, USDC_MINT, lamports);
        if (!order1.transaction) {
            console.error(`[${worker.label}] ❌ 阶段1失败 (获取 Order):`, JSON.stringify(order1));
            return;
        }

        const usdcOutAmount = order1.outAmount; // 记录下换到的 USDC 数量
        console.log(`[${worker.label}] 报价: ${amountSOL} SOL -> ${(usdcOutAmount / 1_000_000).toFixed(2)} USDC | requestId: ${order1.requestId}`);

        // 2. 签名
        const txBuf1 = Buffer.from(order1.transaction, "base64");
        const tx1 = VersionedTransaction.deserialize(txBuf1);
        tx1.sign([worker.keypair]);
        const signedTx1 = Buffer.from(tx1.serialize()).toString("base64");

        // 3. 执行
        const res1 = await executeOrder(worker, signedTx1, order1.requestId);
        if (res1.status !== "Success" && !res1.signature) {
            console.error(`[${worker.label}] ❌ 阶段1失败 (执行交易):`, JSON.stringify(res1));
            return;
        }
        console.log(`[${worker.label}] ✅ 阶段1成功: https://solscan.io/tx/${res1.signature}`);

        // --- 等待确认 ---
        console.log(`[${worker.label}] ⏳ 等待 10 秒确认交易...`);
        await new Promise(r => setTimeout(r, 10000));

        // --- 阶段 2: USDC -> SOL ---
        console.log(`[${worker.label}] 2️⃣ 正在 Swap USDC -> SOL (${(usdcOutAmount / 1_000_000).toFixed(2)} USDC)...`);

        // 1. 获取 order (把刚才得到的 USDC 全部换回)
        const order2 = await getOrder(worker, USDC_MINT, SOL_MINT, usdcOutAmount);
        if (!order2.transaction) {
            console.error(`[${worker.label}] ❌ 阶段2失败 (获取 Order):`, JSON.stringify(order2));
            return;
        }

        console.log(`[${worker.label}] 报价: ${(usdcOutAmount / 1_000_000).toFixed(2)} USDC -> ${(order2.outAmount / LAMPORTS_PER_SOL).toFixed(4)} SOL | requestId: ${order2.requestId}`);

        // 2. 签名
        const txBuf2 = Buffer.from(order2.transaction, "base64");
        const tx2 = VersionedTransaction.deserialize(txBuf2);
        tx2.sign([worker.keypair]);
        const signedTx2 = Buffer.from(tx2.serialize()).toString("base64");

        // 3. 执行
        const res2 = await executeOrder(worker, signedTx2, order2.requestId);
        if (res2.status !== "Success" && !res2.signature) {
            console.error(`[${worker.label}] ❌ 阶段2失败 (执行交易):`, JSON.stringify(res2));
            return;
        }
        console.log(`[${worker.label}] ✅ 阶段2成功: https://solscan.io/tx/${res2.signature}`);
        console.log(`[${worker.label}] 🎉 完整循环交易完成!`);

    } catch (e) {
        console.error(`[${worker.label}] ❌ Swap 流程异常:`, e.message);
    }
}

async function loopOnce() {
    const worker = workers[randInt(0, workers.length - 1)];
    await executeSwap(worker);
}

function scheduleNext() {
    const daytime = isDaytime();
    const minMs = daytime ? DAY_INTERVAL_MIN_MS : NIGHT_INTERVAL_MIN_MS;
    const maxMs = daytime ? DAY_INTERVAL_MAX_MS : NIGHT_INTERVAL_MAX_MS;
    const delay = randInt(minMs, maxMs);

    console.log(`[${new Date().toLocaleString()}] ⏳ 下次任务将在 ${(delay / 60000).toFixed(1)} 分钟后开始...`);

    setTimeout(async () => {
        try {
            await loopOnce();
        } catch (e) {
            console.error("Loop error:", e.message);
        } finally {
            scheduleNext();
        }
    }, delay);
}

// 启动
const mode = proxyList.length > 0 ? "SOCKS5 代理" : "直连";
console.log(`🔥 Jupiter Swap Bot 启动 (Ultra API / ${mode})`);
console.log(`钱包数量: ${workers.length}`);
workers.forEach(w => {
    const proxyInfo = w.proxyAgent ? `代理 ${proxyList[(w.index - 1) % proxyList.length]}` : "无代理";
    console.log(`  - ${w.label}: ${w.keypair.publicKey.toBase58()} | ${proxyInfo}`);
});

await loopOnce();
scheduleNext();
