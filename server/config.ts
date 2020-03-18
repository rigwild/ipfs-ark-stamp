import path from 'path'
import dotenvSafe from 'dotenv-safe'

// Load environment configuration
dotenvSafe.config({
  path: path.resolve(__dirname, '..', '.env'),
  example: path.resolve(__dirname, '..', '.env.example')
})

const env = process.env as { [key: string]: string }

export const { IPFS_NODE_MULTIADDR, ARK_API_URI, ARK_EXPLORER_URI, ARK_NETWORK, ARK_WALLET_PASSPHRASE } = env
export const SERVER_PORT = parseInt(env.SERVER_PORT, 10)
export const FILE_UPLOAD_MAX_SIZE = parseInt(env.FILE_UPLOAD_MAX_SIZE, 10)

export const tempDocumentUploadDir = path.resolve(__dirname, '..', 'uploadsTemp')
