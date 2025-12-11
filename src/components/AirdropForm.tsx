"use client"

import { useState } from "react"
import { InputForm } from "./ui/InputField"

export default function AirdropForm() {
    const [tokenAddress, setTokenAddress] = useState("")

    return (
        <div>
            <InputForm
                label="Token Address"
                placeholder="0x"
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value)}
            />
        </div>
    )
}