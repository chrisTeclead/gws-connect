// Test backend. Also what the doctor reports if it is ever selected on a real
// machine, which would mean no platform store was available.
const store = new Map()

const key = (setId, field) => `${setId} ${field}`

export default {
  name: 'memory',
  async get (setId, field) {
    return store.has(key(setId, field)) ? store.get(key(setId, field)) : null
  },
  async set (setId, field, value) { store.set(key(setId, field), value) },
  async has (setId, field) { return store.has(key(setId, field)) },
  async removeSet (setId) {
    for (const k of [...store.keys()]) {
      if (k.startsWith(`${setId} `)) store.delete(k)
    }
  },
  async selfTest () {
    await this.set('__selftest__', 'probe', 'x')
    const back = await this.get('__selftest__', 'probe')
    await this.removeSet('__selftest__')
    return back === 'x'
  }
}
