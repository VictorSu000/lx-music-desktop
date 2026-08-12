import { createAdapter } from 'webdav-fs'
import { gzipData, gunzipData } from './nodejs'

// TODO 填上URL、用户名密码
const WEBDAV_URL = ""
const WEBDAV_USERNAME = ""
const WEBDAV_PASSWORD = ""

const rootDir = '/lx-music'
const configFile = `${rootDir}/lx_list.lxmc`
const configFileForMerge = `${rootDir}/lx_list_merge.lxmc`
const metadataFile = `${rootDir}/lx_list_metadata.json`
const historyDir = `${rootDir}/history`

/**
 * 云端同步元数据
 *
 * contentHash 用于判断歌单内容是否真的发生变化（避免无意义的同步），
 * revision 单调递增用于判断版本先后（不依赖各客户端的系统时钟），
 * updatedAt 仅用于展示给用户看。
 */
export interface RemoteSyncMetadata {
  contentHash: string
  revision: number
  updatedAt: number
  deviceId: string
  deviceName: string
}

/** WebDAV 是否已配置，未配置时所有同步操作都应跳过 */
export const isWebDAVConfigured = (): boolean => Boolean(WEBDAV_URL)

type Adapter = ReturnType<typeof createAdapter>
let adapter: Adapter | null = null
const getAdapter = (): Adapter => {
  if (!WEBDAV_URL) throw new Error('WebDAV 未配置')
  adapter ??= createAdapter(WEBDAV_URL, {
    username: WEBDAV_USERNAME,
    password: WEBDAV_PASSWORD,
  })
  return adapter
}

const readRemoteFile = async(file: string): Promise<Buffer> => new Promise((resolve, reject) => {
  getAdapter().readFile(file, 'binary', (err, data) => {
    if (err) {
      reject(err)
      return
    }
    if (data == null) {
      reject(new Error(`读取云端文件失败：${file}`))
      return
    }
    resolve(data as Buffer)
  })
})

const writeRemoteFile = async(file: string, data: Buffer): Promise<void> => new Promise((resolve, reject) => {
  getAdapter().writeFile(file, data, 'binary', err => {
    if (err) {
      reject(err)
      return
    }
    resolve()
  })
})

const readRemoteDir = async(dir: string): Promise<string[]> => new Promise((resolve, reject) => {
  getAdapter().readdir(dir, 'node', (err, files) => {
    if (err) {
      reject(err)
      return
    }
    resolve((files ?? []) as string[])
  })
})

const removeRemoteFile = async(file: string): Promise<void> => new Promise((resolve, reject) => {
  getAdapter().unlink(file, err => {
    if (err) {
      reject(err)
      return
    }
    resolve()
  })
})

/** 创建目录，已存在时忽略错误 */
const makeRemoteDir = async(dir: string): Promise<void> => new Promise(resolve => {
  getAdapter().mkdir(dir, () => { resolve() })
})

const encodeData = async(data: unknown): Promise<Buffer> => gzipData(JSON.stringify(data))

const decodeData = async(raw: Buffer): Promise<any> => {
  let data: any = await gunzipData(raw)
  data = JSON.parse(data)
  // 修复v1.14.0出现的导出数据被序列化两次的问题
  if (typeof data != 'object') {
    try {
      data = JSON.parse(data)
    } catch (err) {
      return data
    }
  }
  return data
}

/**
 * 上传歌单到云端，失败时抛出异常
 */
export const uploadPlayListData = async(data: unknown, useMergeFile = false): Promise<void> => {
  await writeRemoteFile(useMergeFile ? configFileForMerge : configFile, await encodeData(data))
}

/**
 * 从云端下载歌单，失败时抛出异常
 */
export const downloadPlayListData = async(useMergeFile = false): Promise<any> => {
  return decodeData(await readRemoteFile(useMergeFile ? configFileForMerge : configFile))
}

/**
 * 读取云端同步元数据，不存在时返回 null。
 * 网络异常与「文件不存在」无法可靠区分，这里统一按「云端没有数据」处理，
 * 由调用方配合 requireRemoteReachable 判断云端是否真的可用。
 */
export const getRemoteMetadata = async(): Promise<RemoteSyncMetadata | null> => {
  try {
    return await decodeData(await readRemoteFile(metadataFile)) as RemoteSyncMetadata
  } catch (err: any) {
    console.log('Remote metadata not found or error:', err?.message ?? err)
    return null
  }
}

export const saveRemoteMetadata = async(metadata: RemoteSyncMetadata): Promise<void> => {
  await writeRemoteFile(metadataFile, await encodeData(metadata))
}

/**
 * 探测云端是否可达。用于区分「云端没有歌单」和「云端连不上」两种情况，
 * 后者必须放弃本次同步，否则会把云端数据当成空的然后被本地覆盖。
 */
export const checkRemoteReachable = async(): Promise<boolean> => {
  try {
    await makeRemoteDir(rootDir)
    await readRemoteDir(rootDir)
    return true
  } catch (err: any) {
    console.log('WebDAV unreachable:', err?.message ?? err)
    return false
  }
}

const historyFileReg = /^lx_list_(\d+)\.lxmc$/

/**
 * 覆盖云端数据前，先把即将被覆盖的那一份存入历史目录，只保留最近 maxKeep 份
 */
export const backupRemotePlayList = async(data: unknown, maxKeep = 10): Promise<void> => {
  await makeRemoteDir(historyDir)
  await writeRemoteFile(`${historyDir}/lx_list_${Date.now()}.lxmc`, await encodeData(data))

  const files = await readRemoteDir(historyDir)
  const backups = files
    .map(name => ({ name, time: Number(historyFileReg.exec(name)?.[1] ?? 0) }))
    .filter(item => item.time > 0)
    .sort((a, b) => b.time - a.time)
  for (const item of backups.slice(maxKeep)) {
    await removeRemoteFile(`${historyDir}/${item.name}`).catch(err => {
      console.log('Failed to remove old backup:', item.name, err?.message ?? err)
    })
  }
}

/**
 * 手动导出歌单到网盘（设置页使用）。
 * 保持原有的回调式接口，不向调用方抛异常，错误通过 callback 的文案告知用户。
 */
export const saveLxConfigFileWebDAV = async(data: unknown, onMessage: (message: string) => void, useMergeFile = false) => {
  try {
    await uploadPlayListData(data, useMergeFile)
    onMessage('歌单上传成功')
  } catch (err: any) {
    console.log(err)
    onMessage('上传歌单失败，' + String(err?.message ?? err))
  }
}

/**
 * 手动从网盘导入歌单（设置页使用）
 */
export const readLxConfigFileWebDAV = async(useMergeFile = false) => {
  return downloadPlayListData(useMergeFile)
}
