import { Connection } from '@arkecosystem/client'
import { Transactions, Managers, Identities } from '@arkecosystem/crypto'
import { ITransactionData } from '@arkecosystem/crypto/dist/interfaces'

import { ARK_WALLET_PASSPHRASE, ARK_API_URI, ARK_NETWORK } from './config'

export const arkApiConnection = new Connection(ARK_API_URI)

/** Fetch the latest block height */
const getLatestBlockHeight = async (): Promise<number> =>
  (await arkApiConnection.get('blockchain')).body.data.block.height

/**
 * Initialize `@arkecosystem/crypto` lib settings.
 *
 * Must be called before signing a transaction!!
 * The latest available block height is set to use latest features
 */
export const initArkCryptoLib = async () => {
  Managers.configManager.setFromPreset(ARK_NETWORK as 'devnet' | 'mainnet' | 'testnet' | 'unitnet')
  Managers.configManager.setHeight(await getLatestBlockHeight())
}

/** Get a wallet next transaction nonce */
const getNextNonce = async (walletAddress: string) => {
  const nonce = (await arkApiConnection.api('wallets').get(walletAddress)).body.data.nonce
  return (parseInt(nonce, 10) + 1).toString()
}

/**
 * Build and sign a new transaction
 * @param receiverAddress Recipient wallet address
 * @param amount Amount of ARK to send in arktoshi (default = 0.1 ARK = 0.1 * 1e8 arktoshi)
 * @param fee Amount of ARK used for the transaction fee (default = 0.01 ARK = 0.01 * 1e8 arktoshi)
 * @param vendorField Vendor field (SmartBridge)
 */
export const signTransaction = async (
  receiverAddress: string,
  amount: string = `${1 * 1e8}`,
  fee: string = `${0.1 * 1e8}`,
  vendorField?: string | object
) => {
  // Get wallet's next transaction nonce
  const nextNonce = await getNextNonce(Identities.Address.fromPassphrase(ARK_WALLET_PASSPHRASE))

  // Build the transaction
  let transactionToSend = Transactions.BuilderFactory.transfer()
    .recipientId(receiverAddress)
    .amount(amount)
    .fee(fee)
    .version(2)
    .nonce(nextNonce)

  // Set the bridge chain field
  if (vendorField)
    transactionToSend.vendorField(typeof vendorField === 'object' ? JSON.stringify(vendorField) : vendorField)

  return transactionToSend.sign(ARK_WALLET_PASSPHRASE).getStruct()
}

/**
 * Submit a signed transaction to the blockchain
 * @param transaction Signed transaction
 */
export const sendTransaction = (transaction: ITransactionData) =>
  arkApiConnection.api('transactions').create({ transactions: [transaction] })

/**
 * Build and sign a new transaction back to the sender's wallet.
 *
 * Useful to register some data permanently in the blockchain.
 *
 * Amount: 1 ARK, Fee: 0.01 ARK
 * @param vendorField Vendor field (SmartBridge)
 */
export const signTransactionBackToMyAddress = (vendorField?: string | object) =>
  signTransaction(Identities.Address.fromPassphrase(ARK_WALLET_PASSPHRASE), `${1 * 1e8}`, `${0.01 * 1e8}`, vendorField)
