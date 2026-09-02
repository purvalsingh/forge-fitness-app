/**
 * On-device photo store for physique check-ins.
 * Physique images are treated as highly private: they live in IndexedDB on this device only,
 * and are sent over the network exactly once — to the AI analysis endpoint, when the user asks for it.
 * They are never uploaded to the database, never shared, and are deleted with their check-in.
 */
const DB_NAME = 'forge-photos'
const STORE = 'photos'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const photos = {
  put: (key: string, dataUrl: string) => tx('readwrite', s => s.put(dataUrl, key)),
  get: (key: string) => tx<string | undefined>('readonly', s => s.get(key)),
  del: (key: string) => tx('readwrite', s => s.delete(key)),
  keys: () => tx<IDBValidKey[]>('readonly', s => s.getAllKeys()),
  clear: () => tx('readwrite', s => s.clear()),
}

/** Downscale before storing: keeps IndexedDB small and the AI request fast. */
export function downscale(file: File | Blob, max = 720, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a readable image.'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function splitDataUrl(dataUrl: string) {
  const [head, data] = dataUrl.split(',')
  return { mime: head.match(/data:(.*?);/)?.[1] ?? 'image/jpeg', base64: data ?? '' }
}
