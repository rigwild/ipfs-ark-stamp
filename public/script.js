new Vue({
  el: '#app',
  data() {
    return {
      // 'ready' | 'loading'
      stampedFilesTableState: 'ready',
      stampedFilesTableMessage: null,

      newDocument: null,
      newDocumentIsLoading: false,
      newDocumentMessage: null,

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
    apiCall(route, method = 'GET', body, headers = {}, options = {}, isJsonBody = true) {
      return fetch(route, {
        method,
        headers: {
          ...headers,
          ...(body && isJsonBody ? { 'content-type': 'application/json' } : {})
        },
        body: body ? (isJsonBody ? JSON.stringify(body) : body) : undefined,
        ...options
      })
        .then(async res => {
          const contentType = res.headers.get('content-type')
          if (contentType && contentType.indexOf('application/json') !== -1) res.bodyJson = await res.json()
          return res
        })
        .then(res => {
          if (!res.ok) {
            console.log(res)
            throw new Error(res.bodyJson ? res.bodyJson.message : res.statusText)
          }
          return res.bodyJson ? res.bodyJson : undefined
        })
    },

    async loadIpfsNodeVersion() {
      this.ipfs.nodeVersion = await this.apiCall('/ipfs/version')
    },
    async loadIpfsStampedFiles() {
      this.stampedFilesTableState = 'loading'
      try {
        this.ipfs.stampedFiles = await this.apiCall('/ipfs/stampedFiles')
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableState = 'ready'
      }
    },

    async deleteIpfsStampedFile({ cid }) {
      if (
        !confirm(
          `Are you sure you want to delete the files in the directory "/stamped" ` +
            `having the CID "${cid}" from the IPFS node ?\n\n` +
            `WARNING: This does not unpin the file from the IPFS node if it is currently pinned. Unpin first.\n` +
            `It will not remove the CID from the ARK Blockchain if applicable, as it is permanent.`
        )
      )
        return

      this.stampedFilesTableState = 'loading'

      try {
        // Remove the file from the IPFS node
        await this.apiCall(`/ipfs/stampedFiles/${cid}`, 'DELETE')
        // Remove the file from the local state
        this.ipfs.stampedFiles = this.ipfs.stampedFiles.filter(x => x.cid !== cid)
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableState = 'ready'
      }
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

      this.stampedFilesTableState = 'loading'

      try {
        // Toggle the pin state from the IPFS node
        await this.apiCall(`/ipfs/stampedFiles/${cid}/pinState`, 'PATCH', { newPinState: !pinned })
        // Toggle the pin state from the local state
        this.ipfs.stampedFiles[this.ipfs.stampedFiles.findIndex(x => x.cid === cid)].pinned = !pinned
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableState = 'ready'
      }
    },

    async addNewFile() {
      this.newDocumentIsLoading = true
      try {
        const formData = new FormData()
        formData.append('document', this.newDocument)
        await this.apiCall(`/ipfs/stampedFiles/`, 'PUT', formData, undefined, undefined, false)
        this.newDocument = null
        this.newDocumentMessage = 'Your document was successfully added to the IPFS node.'

        // Reload the files list
        await this.loadIpfsStampedFiles()
      } catch (err) {
        console.error(err)
        this.newDocumentMessage = err.message
      } finally {
        this.newDocumentIsLoading = false
      }
    },

    async broadcastCid({ cid }) {
      if (
        !confirm(
          `Are you sure you want to broadcast the IPFS CID "${cid}" to the ARK Blockchain ?\n\n` +
            `WARNING: This is PERMANENT and cannot be undone. The CID will NOT BE REMOVABLE from the ARK Blockchain.`
        )
      )
        return

      this.stampedFilesTableState = 'loading'
      try {
        // Toggle the stamp state from the IPFS node
        await this.apiCall(`/ark/broadcastCid/${cid}`, 'POST')

        // Reload the files list
        await this.loadIpfsStampedFiles()
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableState = 'ready'
      }
    }
  }
})
