const ipfsHttpClient = require('ipfs-http-client')

import { IPFS_NODE_MULTIADDR, IPFS_NODE_STAMPED_DIR } from './config'

export let ipfs: any

/**
 * Check the `IPFS_NODE_STAMPED_DIR` file exists and is a directory.
 *
 * Will create it if it does not exist.
 */
export const initIpfsClient = () => {
  ipfs = ipfsHttpClient(IPFS_NODE_MULTIADDR)
  return ipfs.files
    .stat(IPFS_NODE_STAMPED_DIR)
    .catch(async (err: any) => {
      if (err.message === 'file does not exist') {
        // The directory does not exist, create it
        await ipfs.files.mkdir(IPFS_NODE_STAMPED_DIR)
        return ipfs.files.stat(IPFS_NODE_STAMPED_DIR)
      } else throw err
    })
    .then((stat: any) => {
      // Check the `IPFS_NODE_STAMPED_DIR` file is a directory
      if (stat.type !== 'directory')
        throw new Error(`The "${IPFS_NODE_STAMPED_DIR}" IPFS node file is not a directory.`)
    })
}
