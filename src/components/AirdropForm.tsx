"use client"

import React, { useEffect, useMemo, useState } from "react"
import { InputForm } from "./ui/InputField"
import { chainsToTSender, tsenderAbi, erc20Abi } from "../constants"
import { useChainId, useConfig, useAccount, useWriteContract } from "wagmi"
import { readContract, waitForTransactionReceipt } from "@wagmi/core"
import { calculateTotal } from "../utils/calculateTotal/calculateTotal"

type TokenDetails = {
  name?: string
  symbol?: string
  decimals?: number
  totalSupply?: string
}

export default function AirdropForm() {
  const [tokenAddress, setTokenAddress] = useState<string>("")
  const [recipients, setRecipient] = useState<string>("")
  const [amounts, setAmounts] = useState<string>("")

  // UI state
  const [isSending, setIsSending] = useState(false) // overall sending state
  const [isWalletPrompt, setIsWalletPrompt] = useState(false) // MetaMask popup waiting
  const [txHash, setTxHash] = useState<string | null>(null)
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null)
  const [tokenDetailsLoading, setTokenDetailsLoading] = useState(false)
  const [tokenDetailsError, setTokenDetailsError] = useState<string | null>(null)

  const chainId = useChainId()
  const config = useConfig()
  const account = useAccount()
  const total: number = useMemo(() => calculateTotal(amounts), [amounts])
  const { data: hash, isPending, writeContractAsync } = useWriteContract()

  // --- Local Storage: load on mount ---
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("airdrop_form_v1")
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.tokenAddress) setTokenAddress(parsed.tokenAddress)
        if (parsed.recipients) setRecipient(parsed.recipients)
        if (parsed.amounts) setAmounts(parsed.amounts)
      }
    } catch (e) {
      // ignore
      console.warn("Could not load saved form state", e)
    }
  }, [])

  // save whenever inputs change
  useEffect(() => {
    try {
      const payload = JSON.stringify({ tokenAddress, recipients, amounts })
      window.localStorage.setItem("airdrop_form_v1", payload)
    } catch (e) {
      console.warn("Could not persist form state", e)
    }
  }, [tokenAddress, recipients, amounts])

  // --- Fetch token details (name, symbol, decimals) when tokenAddress changes ---
  useEffect(() => {
    if (!tokenAddress || !tokenAddress.startsWith("0x")) {
      setTokenDetails(null)
      return
    }

    let mounted = true
    ;(async () => {
      setTokenDetailsLoading(true)
      setTokenDetailsError(null)
      try {
        const name = (await readContract(config, {
          abi: erc20Abi,
          address: tokenAddress as `0x${string}`,
          functionName: "name",
        })) as string

        const symbol = (await readContract(config, {
          abi: erc20Abi,
          address: tokenAddress as `0x${string}`,
          functionName: "symbol",
        })) as string

        // decimals may return number or BigInt depending on provider
        const decimalsResp = (await readContract(config, {
          abi: erc20Abi,
          address: tokenAddress as `0x${string}`,
          functionName: "decimals",
        })) as any
        const decimals = Number(decimalsResp)

        // optional: try totalSupply (string)
        let totalSupply: string | undefined
        try {
          const ts = await readContract(config, {
            abi: erc20Abi,
            address: tokenAddress as `0x${string}`,
            functionName: "totalSupply",
          })
          totalSupply = ts?.toString()
        } catch (e) {
          // ignore if not present
        }

        if (!mounted) return
        setTokenDetails({ name, symbol, decimals, totalSupply })
      } catch (e: any) {
        if (!mounted) return
        setTokenDetails(null)
        setTokenDetailsError("Could not read token details. Make sure the address is a valid ERC-20.")
      } finally {
        if (mounted) setTokenDetailsLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [tokenAddress, config])

  async function getApprovedAmount(tSenderAddress: string | null): Promise<number> {
    if (!tSenderAddress) {
      alert("No address found, please use a supported chain")
      return 0
    }

    // read from the chain to see if we have approved enough tokens
    const response = await readContract(config, {
      abi: erc20Abi,
      address: tokenAddress as `0x${string}`,
      functionName: "allowance",
      args: [account.address, tSenderAddress as `0x${string}`],
    })
    // allowance is usually BigInt -- convert to number safely
    try {
      const asNum = typeof response === "bigint" ? Number(response) : Number(response || 0)
      return asNum
    } catch (e) {
      return 0
    }
  }

  // helper to wrap writeContractAsync and manage spinner / wallet prompt states
  async function sendTx(payload: Parameters<typeof writeContractAsync>[0], waitForReceipt = true) {
    if (!writeContractAsync) throw new Error("writeContractAsync not available")

    setIsWalletPrompt(true) // MetaMask will likely open now
    setIsSending(true)
    try {
      const txHash = await writeContractAsync(payload)
      setTxHash(String(txHash))
      setIsWalletPrompt(false) // user either confirmed or rejected the popup

      if (waitForReceipt) {
        // wait for the transaction to be mined
        const receipt = await waitForTransactionReceipt(config, { hash: `0x${String(txHash)}` })
        return receipt
      }

      return txHash
    } finally {
      // we won't clear isSending here if there is a following tx still in-flight; caller should manage
      setIsWalletPrompt(false)
      setIsSending(false)
    }
  }

  async function handleSubmit() {
    try {
      setIsSending(true)
      const tSenderAddress = chainsToTSender[chainId]?.["tsender"]
      const approveAmount = await getApprovedAmount(tSenderAddress)

      // parse recipients and amounts arrays early and validate basic shape
      const recipientsArr = recipients
        .split(/[\n,]+/)
        .map((addr) => addr.trim())
        .filter((addr) => addr !== "")

      const amountsArr = amounts
        .split(/[\n,]+/)
        .map((amt) => amt.trim())
        .filter((amt) => amt !== "")

      if (recipientsArr.length !== amountsArr.length) {
        alert("Number of recipients and amounts must match")
        return
      }

      if (!tSenderAddress) {
        alert("Unsupported chain or missing tSender address for this chain")
        return
      }

      // ensure total uses BigInt when sending
      const totalBigInt = BigInt(total)

      // if allowance insufficient, first send approval
      if (approveAmount < total) {
        // send approve
        await sendTx(
          {
            abi: erc20Abi,
            address: tokenAddress as `0x${string}`,
            functionName: "approve",
            args: [tSenderAddress as `0x${string}`, totalBigInt],
          },
          true
        )
      }

      // then call airdrop
      await sendTx(
        {
          abi: tsenderAbi,
          address: tSenderAddress as `0x${string}`,
          functionName: "airdropERC20",
          args: [
            tokenAddress,
            recipientsArr,
            amountsArr,
            BigInt(total),
          ],
        },
        true
      )

      alert("Airdrop transaction submitted and confirmed")
    } catch (e: any) {
      console.error(e)
      alert(e?.message || "Transaction failed or was rejected")
    } finally {
      setIsSending(false)
      setIsWalletPrompt(false)
    }
  }

  // small spinner component
  const Spinner = ({ size = 16 }: { size?: number }) => (
    <svg
      role="status"
      className={`animate-spin inline-block ml-2 h-${size} w-${size}`}
      viewBox="0 0 100 101"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size }}
    >
      <path
        d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.0816 50.5908C9.0816 73.1895 27.4013 91.5092 50 91.5092C72.5987 91.5092 90.9184 73.1895 90.9184 50.5908C90.9184 27.9921 72.5987 9.6724 50 9.6724C27.4013 9.6724 9.0816 27.9921 9.0816 50.5908Z"
        fill="#E5E7EB"
      />
      <path
        d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5533C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7233 75.2124 7.41289C69.5422 4.10248 63.2754 1.94025 56.7221 1.05197C51.7663 0.367233 46.7655 0.446843 41.8352 1.27873C39.3926 1.67751 37.9725 4.19778 38.6106 6.62326C39.2487 9.04874 41.7325 10.4715 44.1783 10.1071C47.8511 9.54216 51.5696 9.52632 55.2332 10.0605C60.8646 10.8356 66.2661 12.7684 71.0587 15.7578C75.8514 18.7471 79.9426 22.6962 82.9945 27.373C84.9051 30.2801 86.4622 33.5078 87.6342 36.9533C88.4079 39.3376 91.5423 40.678 93.9676 39.0409Z"
        fill="currentColor"
      />
    </svg>
  )

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="space-y-4">
        <InputForm
          label="Token Address"
          placeholder="0x"
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
        />

        <InputForm
          label="Recipients"
          placeholder="0x123, 0x456"
          value={recipients}
          onChange={(e) => setRecipient(e.target.value)}
          large={true}
        />

        <InputForm
          label="Amount"
          placeholder="100,200,300..."
          value={amounts}
          onChange={(e) => setAmounts(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSending || isWalletPrompt}
            className={`px-4 py-2 bg-blue-600 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {isSending ? (
              <span className="flex items-center">
                Sending
                <Spinner size={18} />
              </span>
            ) : (
              "Send tokens"
            )}
          </button>

          {/* indicate wallet popup separately so UX is clearer */}
          {isWalletPrompt && (
            <div className="text-sm text-gray-600 flex items-center">
              Waiting for wallet confirmation
              <Spinner size={14} />
            </div>
          )}

          {/* show tx hash if present */}
          {txHash && (
            <div className="text-sm text-gray-700">Latest tx: <span className="font-mono">{txHash}</span></div>
          )}
        </div>
      </div>

      {/* token details box */}
      <div className="mt-6 p-4 border rounded-lg bg-white shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-bold text-black">Token details</h3>
          {tokenDetailsLoading && <span className="text-xs">Loading…</span>}
        </div>

        {!tokenAddress ? (
          <div className="text-xs text-black">Enter a token contract address to see details here.</div>
        ) : tokenDetailsError ? (
          <div className="text-xs text-red-600">{tokenDetailsError}</div>
        ) : tokenDetails ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-black">Name</div>
            <div className="font-bold text-green-700">{tokenDetails.name}</div>

            <div className="text-black">Symbol</div>
            <div className="font-bold text-green-700">{tokenDetails.symbol}</div>

            <div className="text-black">Decimals</div>
            <div className="font-bold text-green-700">{tokenDetails.decimals}</div>

            <div className="text-black">Total supply</div>
            <div className="font-bold break-words text-green-700">{tokenDetails.totalSupply ?? "n/a"}</div>
          </div>
        ) : (
          <div className="text-xs text-black">No details available for this address.</div>
        )}
      </div>

      {/* small footer with help text and saved status */}
      <div className="mt-3 text-xs text-gray-500">
        Inputs are saved to local storage — refreshing the page will keep your current values.
      </div>
    </div>
  )
}
