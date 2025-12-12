"use client"

import { useState } from "react"
import { InputForm } from "./ui/InputField"

export default function AirdropForm() {
    const [tokenAddress, setTokenAddress] = useState("")
    const [recipients, setRecipient] = useState("")
    const [amounts, setAmounts] = useState("")

    async function handleSubmit() {
        console.log(tokenAddress)
        console.log(recipients)
        console.log(amounts)
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
            <button onClick={handleSubmit}>
                Send tokens
            </button>
        </div>
    )
}