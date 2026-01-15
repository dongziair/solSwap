import os
import time
import random
import base58
from dotenv import load_dotenv
from solana.rpc.api import Client
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.system_program import TransferParams, transfer

LAMPORTS_PER_SOL = 1_000_000_000

# ========= 读取 .env =========
load_dotenv()

KEY_A = os.getenv("SOL_WALLET_A_PRIVATE_KEY")
KEY_B = os.getenv("SOL_WALLET_B_PRIVATE_KEY")
RPC_URL = os.getenv("SOL_RPC_URL", "https://api.mainnet-beta.solana.com")

if not KEY_A or not KEY_B:
    raise RuntimeError("❌ .env 中缺少钱包私钥")

client = Client(RPC_URL)

# ========= 配置 =========

INTERVAL_SECONDS = 10 * 60
MIN_SOL = 0.005
MAX_SOL = 0.01

# ========= 钱包初始化 =========

def keypair_from_base58(b58_key: str) -> Keypair:
    secret = base58.b58decode(b58_key)
    return Keypair.from_bytes(secret)

wallet_a = keypair_from_base58(KEY_A)
wallet_b = keypair_from_base58(KEY_B)

# ========= 工具函数 =========

def random_amount_lamports():
    sol = round(random.uniform(MIN_SOL, MAX_SOL), 6)
    return sol, int(sol * LAMPORTS_PER_SOL)

def send_sol(sender: Keypair, receiver: Pubkey, lamports: int) -> str:
    ix = transfer(
        TransferParams(
            from_pubkey=sender.pubkey(),
            to_pubkey=receiver,
            lamports=lamports,
        )
    )
    
    # 获取最新区块哈希
    blockhash = client.get_latest_blockhash().value.blockhash
    
    # 构建并签名交易
    tx = Transaction.new_signed_with_payer(
        [ix],
        sender.pubkey(),
        [sender],
        blockhash
    )

    # 发送交易
    resp = client.send_transaction(tx)
    
    # 发送失败通常会抛出异常，这里主要处理 RPC 返回结构
    # solana-py 0.36+ 的 resp.value 是 Signature 对象
    if not resp.value:
         raise Exception(f"RPC异常: {resp}")

    sig = str(resp.value)
    
    # 确认交易 (可选，为了保持原逻辑一致性)
    client.confirm_transaction(resp.value, commitment="confirmed")
    return sig

# ========= 主循环 =========

def main():
    direction = True  # True: A->B, False: B->A

    print("🔐 私钥来源：.env 文件")
    print("🚀 自动转账启动（0.005 ~ 0.01 SOL，每10分钟）")
    print("A:", wallet_a.pubkey())
    print("B:", wallet_b.pubkey())
    print("RPC:", RPC_URL)

    while True:
        try:
            sol, lamports = random_amount_lamports()

            if direction:
                sig = send_sol(wallet_a, wallet_b.pubkey(), lamports)
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] A → B | {sol} SOL | {sig}")
            else:
                sig = send_sol(wallet_b, wallet_a.pubkey(), lamports)
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] B → A | {sol} SOL | {sig}")

            direction = not direction

        except Exception as e:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ❌ 转账失败: {e}")

        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
