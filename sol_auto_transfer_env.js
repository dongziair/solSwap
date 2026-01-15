import "dotenv/config";
import bs58 from "bs58";
import {
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// ======== 配置 ========

const RPC_URL = process.env.SOL_RPC_URL || "https://api.mainnet-beta.solana.com";
const INTERVAL_MS = 10 * 60 * 1000;

const MIN_SOL = 0.005;
const MAX_SOL = 0.01;

// ======== 从 .env 读取私钥 ========

const KEY_A = process.env.SOL_WALLET_A_PRIVATE_KEY;
const KEY_B = process.env.SOL_WALLET_B_PRIVATE_KEY;

if (!KEY_A || !KEY_B) {
    throw new Error("❌ .env 缺少 SOL_WALLET_A_PRIVATE_KEY 或 SOL_WALLET_B_PRIVATE_KEY");
}

function keypairFromBase58(b58) {
    const secretKey = bs58.decode(b58.trim());
    return Keypair.fromSecretKey(secretKey);
}

const walletA = keypairFromBase58(KEY_A);
const walletB = keypairFromBase58(KEY_B);

const connection = new Connection(RPC_URL, "confirmed");

// ======== 工具函数 ========

function randomAmountLamports() {
    // 保留6位小数，避免太多尾数
    const sol = Number((Math.random() * (MAX_SOL - MIN_SOL) + MIN_SOL).toFixed(6));
    const lamports = BigInt(Math.round(sol * LAMPORTS_PER_SOL));
    return { sol, lamports };
}

async function transferSOL(from, toPubkey, lamportsBigInt) {
    // web3.js 这里接受 number；但 lamports 可能超过安全整数？本场景很小，安全。
    const lamports = Number(lamportsBigInt);

    const tx = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: from.publicKey,
            toPubkey: toPubkey,
            lamports,
        })
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [from]);
    return sig;
}

// ======== 主循环 ========

let direction = true; // true: A->B, false: B->A

async function loopOnce() {
    const { sol, lamports } = randomAmountLamports();

    try {
        if (direction) {
            const sig = await transferSOL(walletA, walletB.publicKey, lamports);
            console.log(`[${new Date().toLocaleString()}] A → B | ${sol} SOL | tx: ${sig}`);
        } else {
            const sig = await transferSOL(walletB, walletA.publicKey, lamports);
            console.log(`[${new Date().toLocaleString()}] B → A | ${sol} SOL | tx: ${sig}`);
        }

        direction = !direction;
    } catch (e) {
        console.error(`[${new Date().toLocaleString()}] ❌ 转账失败:`, e?.message || e);
        // 失败时不切换方向：保持下次仍然尝试同方向（更稳）
        // direction 不变
    }
}

// 立即跑一次
await loopOnce();

// 每10分钟跑一次
setInterval(() => {
    loopOnce().catch((e) => console.error("loop error:", e?.message || e));
}, INTERVAL_MS);

console.log("✅ 启动成功");
console.log("RPC:", RPC_URL);
console.log("A:", walletA.publicKey.toBase58());
console.log("B:", walletB.publicKey.toBase58());
console.log(`规则：每 ${INTERVAL_MS / 60000} 分钟，随机转 ${MIN_SOL}～${MAX_SOL} SOL，方向轮流`);
