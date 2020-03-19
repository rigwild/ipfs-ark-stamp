import { ORBIT_DB_STORE } from './config'
import { ipfs } from './ipfs'

import OrbitDB from 'orbit-db'
import EventStore from 'orbit-db-eventstore'

export interface StampEntry {
  arkTransactionId: string
  ipfsCid: string
}

export let orbitDbInstance: OrbitDB
export let orbitDbStore: EventStore<StampEntry>

export const initOrbitDb = async () => {
  orbitDbInstance = await OrbitDB.createInstance(ipfs)
  orbitDbStore = await orbitDbInstance.log<StampEntry>(ORBIT_DB_STORE, { create: true })
  await orbitDbStore.load()

  // Usage:
  // for (const anEntry of orbitDbStore.iterator({ limit: -1, reverse: true })) {}
}
