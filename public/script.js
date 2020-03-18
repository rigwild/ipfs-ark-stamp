new Vue({
  el: '#app',
  data() {
    return {
      // 'ready' | 'loading'
      stampedFilesTablesState: 'ready',
      ipfs: {
        connectionSuccess: false,
        nodeVersion: null,
        stampedFiles: null
      }
    }
  },

  computed: {
    stampedFilesCount() {
      return this.ipfs.stampedFiles.length
    }
  },

  async mounted() {
    this.ipfs.connectionSuccess = false
    await this.loadIpfsNodeVersion()
    await this.loadIpfsStampedFiles()
    console.log(this.ipfs.stampedFiles)
    this.ipfs.connectionSuccess = true
  },

  methods: {
    async loadIpfsNodeVersion() {
      this.ipfs.nodeVersion = await fetch('/ipfs/version').then(res => res.json())
    },
    async loadIpfsStampedFiles() {
      this.ipfs.stampedFiles = await fetch('/ipfs/stampedFiles').then(res => res.json())
    },

    async deleteIpfsStampedFile({ cid }) {
      if (
        !confirm(
          `Are you sure you want to delete the files in the directory "/stamped" ` +
            `having the CID "${cid}" from the IPFS node ?\n\n` +
            `WARNING: This does not unpin the file from the IPFS node if it is currently pinned. Unpin first.`
        )
      )
        return

      this.stampedFilesTablesState = 'loading'

      // Remove the file from the IPFS node
      await fetch(`/ipfs/stampedFiles/${cid}`, { method: 'DELETE' })
      // Remove the file from the local state
      this.ipfs.stampedFiles = this.ipfs.stampedFiles.filter(x => x.cid !== cid)

      this.stampedFilesTablesState = 'ready'
    },

    async setIpfsStampedFilePinState({ cid, pinned }) {
      if (
        !confirm(
          `Are you sure you want to ${pinned ? 'UNPIN' : 'PIN'} the file ` +
            `having the CID "${cid}" from the IPFS node ?\n\n` +
            `WARNING: Pinning is a global action in an IPFS node.\n` +
            `It may affect a file having the same CID pin state but not in the "/stamped" directory.`
        )
      )
        return

      this.stampedFilesTablesState = 'loading'

      // Toggle the pin state from the IPFS node
      await fetch(`/ipfs/stampedFiles/${cid}/pinState`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newPinState: !pinned
        })
      })
      // Toggle the pin state from the local state
      this.ipfs.stampedFiles[this.ipfs.stampedFiles.findIndex(x => x.cid === cid)].pinned = !pinned

      this.stampedFilesTablesState = 'ready'
    }
  }
})
