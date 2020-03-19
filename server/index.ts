import express from 'express'
import boom from '@hapi/boom'
const nanoid = require('nanoid')

import { initIpfsClient, ipfs } from './ipfs'
import { initOrbitDb, orbitDbStore } from './orbitDb'
import { initArkCryptoLib, broadcastIPFSTransaction } from './ark'
import { asyncMiddleware, errorHandler } from './middlewares'
import { SERVER_PORT, FILE_UPLOAD_MAX_SIZE, IPFS_NODE_STAMPED_DIR, ARK_EXPLORER_URI } from './config'

// Connect to IPFS daemon with multiaddr

const app = express()

// Parse JSON body
app.use(express.json())

// Use gzip compression to improve performance
app.use(require('compression')())

// Enhance the app security by setting some HTTP headers
app.use(require('helmet')())

// Handle file upload
app.use(
  require('express-fileupload')({
    abortOnLimit: true,
    limits: { fileSize: FILE_UPLOAD_MAX_SIZE },
    safeFileNames: true,
    preserveExtension: true
  })
)

const removeDuplicatedFiles = async () => {
  let seenCIDs = new Set()
  let filesToDelete = []
  for await (const aFile of ipfs.files.ls(IPFS_NODE_STAMPED_DIR)) {
    const cid = aFile.cid.toString()
    if (aFile.type === 0) {
      if (!seenCIDs.has(cid)) seenCIDs.add(cid)
      else filesToDelete.push(aFile)
    }
  }
  return Promise.all(filesToDelete.map(x => ipfs.files.rm(`${IPFS_NODE_STAMPED_DIR}/${x.name}`)))
}

// Get the IPFS node version
app.get(
  '/ipfs/version',
  asyncMiddleware(async (req, res) => {
    res.json(await ipfs.version())
  })
)

// List stamped files on the IPFS node
app.get(
  '/ipfs/stampedFiles',
  asyncMiddleware(async (req, res) => {
    let files: {
      [cid: string]: {
        fullName: string
        size: number
        cid: string
        pinned: boolean
        stamped?: {
          txid: string
          explorerURI: string
        }
      }
    } = {}
    for await (const aFile of ipfs.files.ls(IPFS_NODE_STAMPED_DIR)) {
      const cid = aFile.cid.toString()
      // Ignore directories and duplicates names (will take the first file name if duplicates)
      if (aFile.type === 0 && !(cid in files))
        files[cid] = {
          fullName: aFile.name,
          size: parseFloat((aFile.size / 1024 / 1024).toFixed(2)),
          cid: cid,
          pinned: false
        }
    }

    // Add the pin state
    for await (const aFile of ipfs.pin.ls()) {
      const cid = aFile.cid.toString()
      if (cid in files) files[cid].pinned = true
    }

    // Add the stamped state
    orbitDbStore
      .iterator({ limit: -1, reverse: true })
      .collect()
      .map(x => x.payload.value)
      .forEach(aStamp => {
        if (aStamp.ipfsCid in files) {
          files[aStamp.ipfsCid].stamped = {
            txid: aStamp.arkTransactionId,
            explorerURI: `${ARK_EXPLORER_URI}/transaction/${aStamp.arkTransactionId}`
          }
        }
      })

    res.json(Object.values(files))
  })
)

// Delete a stamped files from the IPFS node
app.delete(
  '/ipfs/stampedFiles/:cid',
  asyncMiddleware(async (req, res) => {
    const cid = req.params.cid
    const filesToDelete = []

    // Filter for files having the CID to delete
    for await (const aFile of ipfs.files.ls(IPFS_NODE_STAMPED_DIR)) {
      if (aFile.cid.toString() === cid) filesToDelete.push(aFile)
    }

    // Check if zero files were found
    if (filesToDelete.length === 0)
      throw boom.notFound(`The file having the CID "${cid}" was not found in the "${IPFS_NODE_STAMPED_DIR}" directory.`)

    // Delete files having the CID
    await Promise.all(filesToDelete.map(x => ipfs.files.rm(`${IPFS_NODE_STAMPED_DIR}/${x.name}`)))

    res.status(200).end()
  })
)

// Toggle the pin state of a stamped files on the IPFS node
app.patch(
  '/ipfs/stampedFiles/:cid/pinState',
  asyncMiddleware(async (req, res) => {
    const cid = req.params.cid
    const newPinState = req.body.newPinState

    if (typeof newPinState !== 'boolean') throw boom.badRequest('"newPinState" should be a valid boolean.')

    // Check the file CID to pin/unpin is available in the IPFS_NODE_STAMPED_DIR directory
    let found = false
    for await (const aFile of ipfs.files.ls(IPFS_NODE_STAMPED_DIR)) {
      if (aFile.cid.toString() === cid) {
        found = true
        break
      }
    }

    // Check if file was found
    if (!found)
      throw boom.notFound(`The file having the CID "${cid}" was not found in the "${IPFS_NODE_STAMPED_DIR}" directory.`)

    // Set the CID pin state
    await ipfs.pin[newPinState ? 'add' : 'rm'](cid)

    res.status(200).end()
  })
)

// Remove duplicated stamped files on the IPFS node
app.post(
  '/ipfs/stampedFiles/removeDuplicates',
  asyncMiddleware(async (req, res) => {
    await removeDuplicatedFiles()
    res.status(200).end()
  })
)

// Stamp a new file on the IPFS node
app.put(
  '/ipfs/stampedFiles/',
  asyncMiddleware(async (reqRaw, res) => {
    const req = reqRaw as typeof reqRaw & { files: any }

    // Check a file was uploaded
    if (!req.files) throw boom.badRequest('You need to send a file.')
    const { document } = req.files
    if (!document) throw boom.badRequest('You need to send a document.')

    // Add the file to the IPFS node
    await ipfs.files.write(`${IPFS_NODE_STAMPED_DIR}/${nanoid(6)}_${document.name}`, Buffer.from(document.data), {
      create: true
    })

    await removeDuplicatedFiles()

    res.status(201).end()
  })
)

// Stamp a new file on the IPFS node
app.post(
  '/ark/broadcastCid/:cid',
  asyncMiddleware(async (req, res) => {
    const cid = req.params.cid

    // Check if the CID was already broadcasted on the ARK blockchain
    for (const anEntry of orbitDbStore.iterator({ limit: -1, reverse: true })) {
      if (anEntry.payload.value.ipfsCid === cid)
        throw boom.conflict(`The IPFS CID "${cid}" is already broadcasted on the ARK blockchain.`)
    }

    // Add the IPFS CID on the ARK blockchain
    const result = await broadcastIPFSTransaction(cid)

    // The IPFS CID was added to the ARK blockchain
    if (result.body.data.accept.length > 0) {
      const txid = result.body.data.accept[0]
      // Add the ARK transaction ID to the database
      await orbitDbStore.add({
        arkTransactionId: txid,
        ipfsCid: cid
      })
      return res.json({ data: { txid } })
    }
    // Adding the IPFS CID to the ARK blockchain throwed an error
    else if (typeof result.body.errors === 'object') {
      const errors = Object.values<{ type: string; message: string }[]>(result.body.errors).map(x => x[0])
      if (errors.length > 0) {
        const error = errors[0]

        // IPFS CID was already broadcasted on the ARK blockchain, update the database
        if (error.type === 'ERR_APPLY' && error.message.includes('already registered on the blockchain')) {
          // Update the database so it is in sync with the ARK blockchain state
          // FIXME: Find the txid
          await orbitDbStore.add({
            arkTransactionId: '',
            ipfsCid: cid
          })
          throw boom.conflict(`The IPFS CID "${cid}" is already broadcasted on the ARK blockchain.`)
        }
        // Unknown error happened
        else throw boom.conflict(error.message)
      }
    }

    // Unknown error
    throw boom.internal()
  })
)

// Serve front-end
app.use('/', express.static('public'))

// Error handler
app.use(errorHandler)

const setup = async () => {
  await Promise.all([
    initIpfsClient(), // Initialize the IPFS client
    initOrbitDb(), // Initialize the Orbit database
    initArkCryptoLib() // Configure the ARK crypto lib
  ])

  // Start the HTTP server
  app.listen(SERVER_PORT, () => console.log(`Server is listening on http://localhost:${SERVER_PORT}/`))
}

setup()
