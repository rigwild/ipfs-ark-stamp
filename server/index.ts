import express from 'express'
const ipfsHttpClient = require('ipfs-http-client')

import { initArkCryptoLib } from './ark'
import { errorHandler } from './middlewares'
import { SERVER_PORT, IPFS_NODE_MULTIADDR, FILE_UPLOAD_MAX_SIZE, tempDocumentUploadDir } from './config'

// Connect to IPFS daemon with multiaddr
const ipfs = ipfsHttpClient(IPFS_NODE_MULTIADDR)

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
    useTempFiles: true,
    tempFileDir: tempDocumentUploadDir,
    limits: { fileSize: FILE_UPLOAD_MAX_SIZE },
    createParentPath: true,
    safeFileNames: true,
    preserveExtension: true
  })
)

app.get('/ipfs/version', async (req, res) => {
  res.json(await ipfs.version())
})

app.get('/ipfs/stampedFiles', async (req, res) => {
  let files: {
    [cid: string]: {
      fullName: string
      size: number
      cid: string
      pinned: boolean
    }
  } = {}
  for await (const aFile of ipfs.files.ls('/stamped')) {
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

  res.json(Object.values(files))
})

app.delete('/ipfs/stampedFiles/:cid', async (req, res) => {
  const cid = req.params.cid
  const filesToDelete = []

  // Filter for files having the CID to delete
  for await (const aFile of ipfs.files.ls('/stamped')) {
    if (aFile.cid.toString() === cid) filesToDelete.push(aFile)
  }

  // Check if zero files were found
  if (filesToDelete.length === 0)
    throw new Error(`The file having the CID "${cid}" was not found in the "/stamped" directory.`)

  // Delete files having the CID
  await Promise.all(filesToDelete.map(x => ipfs.files.rm(`/stamped/${x.name}`)))

  res.status(201).end()
})

app.patch('/ipfs/stampedFiles/:cid/pinState', async (req, res) => {
  const cid = req.params.cid
  const newPinState = req.body.newPinState

  if (typeof newPinState !== 'boolean') throw new Error('`newPinState` should be a valid boolean.')

  // Check the file CID to pin/unpin is available in the `/stamped` directory
  let found = false
  for await (const aFile of ipfs.files.ls('/stamped')) {
    if (aFile.cid.toString() === cid) {
      found = true
      break
    }
  }

  // Check if file was found
  if (!found) throw new Error(`The file having the CID "${cid}" was not found in the "/stamped" directory.`)

  // Set the CID pin state
  await ipfs.pin[newPinState ? 'add' : 'rm'](cid)

  res.status(201).end()
})

app.use('/', express.static('public'))

// Error handler
app.use(errorHandler)

const setup = async () => {
  // Check the `/stamped` file exists and is a directory before starting the server
  // Will create it if it does not exist
  await ipfs.files
    .stat('/stamped')
    .catch(async (err: any) => {
      if (err.message === 'file does not exist') {
        // The directory does not exist, create it
        await ipfs.files.mkdir('/stamped')
        return ipfs.files.stat('/stamped')
      } else throw err
    })
    .then((stat: any) => {
      // Check the `/stamped` file is a directory
      if (stat.type !== 'directory') throw new Error('The `/stamped` IPFS node file is not a directory.')
    })

  // Configure the ARK crypto lib
  await initArkCryptoLib()

  // Start the HTTP server
  app.listen(SERVER_PORT, () => console.log(`Server is listening on http://localhost:${SERVER_PORT}/`))
}

setup()
