import { Connection } from '@arkecosystem/client'
import { Transactions, Managers, Identities } from '@arkecosystem/crypto'

import { ARK_WALLET_PASSPHRASE, ARK_API_URI, ARK_NETWORK, ARK_TRANSACTION_FEE } from './config'

export const arkApiConnection = new Connection(ARK_API_URI)

/**
 * Initialize `@arkecosystem/crypto` lib settings.
 *
 * Must be called before signing a transaction!!
 * The latest available block height is set to use latest features
 */
export const initArkCryptoLib = async () => {
  Managers.configManager.setFromPreset(ARK_NETWORK as 'devnet' | 'mainnet' | 'testnet' | 'unitnet')
  Managers.configManager.setHeight((await arkApiConnection.get('blockchain')).body.data.block.height)
}

/** Get a wallet next transaction nonce */
const getNextNonce = async (walletAddress: string) => {
  const nonce = (await arkApiConnection.api('wallets').get(walletAddress)).body.data.nonce
  return (parseInt(nonce, 10) + 1).toString()
}

// TODO: Find a way to search an IPFS CID transaction ID
// Asked on ARK's Slack `help` channel
// const findIPFSHashTransactionId = (cid: string) => arkApiConnection.api('transactions').search({ type: 5 })

/**
 * Build, sign and broadcast a new IPFS transaction on the ARK blockchain
 * @param cid IPFS content CID
 */
export const broadcastIPFSTransaction = async (cid: string) =>
  arkApiConnection.api('transactions').create({
    transactions: [
      Transactions.BuilderFactory.ipfs()
        .version(2)
        .fee(ARK_TRANSACTION_FEE)
        .ipfsAsset(cid)
        .nonce(await getNextNonce(Identities.Address.fromPassphrase(ARK_WALLET_PASSPHRASE)))
        .sign(ARK_WALLET_PASSPHRASE)
        .getStruct()
    ]
  })
