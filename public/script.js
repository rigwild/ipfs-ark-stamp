new Vue({
  el: '#app',
  data() {
    return {
      stampedFilesTableStateIsLoading: false,
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
      return this.ipfs.stampedFiles ? this.ipfs.stampedFiles.length : 0
    },
    stampedFilesPinnedCount() {
      return this.ipfs.stampedFiles ? this.ipfs.stampedFiles.filter(x => x.pinned).length : 0
    },
    stampedFilesStampedCount() {
      return this.ipfs.stampedFiles ? this.ipfs.stampedFiles.filter(x => x.stamped).length : 0
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
    /** Custom sorting for the stamped files table */
    stampedFilesTableCustomSort(a, b, key) {
      if (key === 'pin') return a.pinned && !b.pinned ? 1 : -1
      else if (key === 'ark') return a.stamped && !b.stamped ? 1 : -1
      // Let b-table handle the sorting
      return false
    },

    /**
     *
     * @param {string} route API route
     * @param {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} [method = 'GET'] HTTP method
     * @param {object} [body] Request body, will be stringified if object
     * @param {{ [header: string]: string }} [headers = {}] Request headers
     * @param {object} [options = {}] Any fetch options to inject
     * @param {boolean} [isJsonBody = true] Is the request body JSON
     */
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
      this.stampedFilesTableStateIsLoading = true
      try {
        this.ipfs.stampedFiles = await this.apiCall('/ipfs/stampedFiles')
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableStateIsLoading = false
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

      this.stampedFilesTableStateIsLoading = true

      try {
        // Remove the file from the IPFS node
        await this.apiCall(`/ipfs/stampedFiles/${cid}`, 'DELETE')
        // Remove the file from the local state
        this.ipfs.stampedFiles = this.ipfs.stampedFiles.filter(x => x.cid !== cid)
        this.stampedFilesTableMessage = null
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableStateIsLoading = false
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

      this.stampedFilesTableStateIsLoading = true

      try {
        // Toggle the pin state from the IPFS node
        await this.apiCall(`/ipfs/stampedFiles/${cid}/pinState`, 'PATCH', { newPinState: !pinned })
        // Toggle the pin state from the local state
        this.ipfs.stampedFiles[this.ipfs.stampedFiles.findIndex(x => x.cid === cid)].pinned = !pinned
        this.stampedFilesTableMessage = null
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableStateIsLoading = false
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
        this.stampedFilesTableMessage = null
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

      this.stampedFilesTableStateIsLoading = true
      try {
        // Broadcast the IPFS CID on the ARK Blockchain
        await this.apiCall(`/ark/broadcastCid/${cid}`, 'POST')

        // Reload the files list
        await this.loadIpfsStampedFiles()
        this.stampedFilesTableMessage = null
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableStateIsLoading = false
      }
    },

    async synchronizeIpfsDb() {
      if (
        !confirm(
          `Are you sure you want to synchronize the IPFS database with the ARK blockchain IPFS CIDs ?\n\n` +
            `WARNING: This may take some time.`
        )
      )
        return

      this.stampedFilesTableStateIsLoading = true
      try {
        // Broadcast the IPFS CID on the ARK Blockchain
        await this.apiCall('/ipfs/stampedFiles/synchronizeDb', 'POST')

        // Reload the files list
        await this.loadIpfsStampedFiles()
        this.stampedFilesTableMessage = null
      } catch (error) {
        console.error(error)
        this.stampedFilesTableMessage = error.message
      } finally {
        this.stampedFilesTableStateIsLoading = false
      }
    }
  }
})
