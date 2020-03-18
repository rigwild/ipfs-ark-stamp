import express from 'express'
import bodyParser from 'body-parser'
import ipfsHttpClient from 'ipfs-http-client'

// Connect to IPFS daemon with multiaddr
const ipfs = ipfsHttpClient('/ip4/127.0.0.1/tcp/6543')

const app = express()

// Parse JSON body
app.use(bodyParser.json())

app.get('/ipfs/version', async (req, res) => {
  res.json(await ipfs.version())
})

app.get('/ipfs/stampedFiles', async (req, res) => {
  let files = {}
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

// Check the `/stamped` file exists and is a directory before starting the server
// Will create it if it does not exist
ipfs.files
  .stat('/stamped')
  .catch(async err => {
    if (err.message === 'file does not exist') {
      // The directory does not exist, create it
      await ipfs.files.mkdir('/stamped')
      return ipfs.files.stat('/stamped')
    } else throw err
  })
  .then(stat => {
    // Check the `/stamped` file is a directory
    if (stat.type !== 'directory') throw new Error('The `/stamped` IPFS node file is not a directory.')
  })
  .then(() => app.listen(3000, () => console.log('Server is listening on http://localhost:3000/')))
