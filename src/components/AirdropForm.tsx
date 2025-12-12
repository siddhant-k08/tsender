"use client"

import { useState, useMemo } from "react"
import { InputForm } from "./ui/InputField"
import { chainsToTSender, tsenderAbi, erc20Abi } from "../constants"
import { useChainId, useConfig, useAccount, useWriteContract } from "wagmi"
import { readContract, waitForTransactionReceipt } from "@wagmi/core"
import { calculateTotal } from "../utils/calculateTotal/calculateTotal"

export default function AirdropForm() {
    const [tokenAddress, setTokenAddress] = useState("")
    const [recipients, setRecipient] = useState("")
    const [amounts, setAmounts] = useState("")
    const chainId = useChainId()
    const config = useConfig()
    const account = useAccount()
    const total: number = useMemo(() => calculateTotal(amounts), [amounts])
    const { data: hash, isPending, writeContractAsync } = useWriteContract()

    async function getApprovedAmount(tSenderAddress: string | null): Promise<number>{
        if (!tSenderAddress) {
            alert("No address found, please use a supported chain")
            return 0
        }

        // read from the chain to see if we have approved enough tokens
        const response = await readContract(config, {
            abi: erc20Abi,
            address: tokenAddress as `0x${string}`,
            functionName: "allowance",
            args: [
                account.address,
                tSenderAddress as `0x${string}`
            ]
        })
        return response as number

    }


    async function handleSubmit() {
        // 1a. Check approval
        // 1b. Approve tokens
        // 2. Call airdrop function
        // 3. Wait for confirmation
        const tSenderAddress = chainsToTSender[chainId]["tsender"]
        const approveAmount = await getApprovedAmount(tSenderAddress)
        console.log(approveAmount)

        if (approveAmount < total) {
            const approvalHash = await writeContractAsync({
                abi: erc20Abi,
                address: tokenAddress as `0x${string}`,
                functionName: "approve",
                args: [
                    tSenderAddress as `0x${string}`,
                    BigInt(total)
                ]
            })
            const approvalReceipt = await waitForTransactionReceipt(config, {
                hash: approvalHash
            })
            console.log("Approval confirmed", approvalReceipt)

            await writeContractAsync({
                abi: tsenderAbi,
                address: tSenderAddress as `0x${string}`,
                functionName: "airdropERC20",
                args: [
                    tokenAddress,
                    // Comma or new line separated
                    recipients.split(/[,\n]+/).map(addr => addr.trim()).filter(addr => addr !== ''),
                    amounts.split(/[,\n]+/).map(amt => amt.trim()).filter(amt => amt !== ''),
                    BigInt(total),
                ],
            })
        } else {
                await writeContractAsync({
                    abi: tsenderAbi,
                    address: tSenderAddress as `0x${string}`,
                    functionName: "airdropERC20",
                    args: [
                        tokenAddress,
                        // Comma or new line separated
                        recipients.split(/[,\n]+/).map(addr => addr.trim()).filter(addr => addr !== ''),
                        amounts.split(/[,\n]+/).map(amt => amt.trim()).filter(amt => amt !== ''),
                        BigInt(total),
                    ],
            })
    
        }

    }

    return (
        <div>
            <InputForm
                label="Token Address"
                placeholder="0x"
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value)}
            />
            <InputForm
                label="Recipients"
                placeholder="0x123, 0x456"
                value={recipients}
                onChange={e => setRecipient(e.target.value)}
                large={true}
            />
            <InputForm
                label="Amount"
                placeholder="100,200,300..."
                value={amounts}
                onChange={e => setAmounts(e.target.value)}
            />
            <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg 
                            hover:bg-blue-700 transition-colors duration-200"
                >
                Send tokens
            </button>
        </div>
    )

}