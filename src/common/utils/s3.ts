import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { gzipData, gunzipData } from "./nodejs"

// 创建 S3 客户端
const s3Client = new S3Client({
  endpoint: "s3.bitiful.net",
  region: "cn-east-1",
  credentials: {
    accessKeyId: "",
    secretAccessKey: "",
  },
})

const bucketName = "victor-public"
const configFileKey = "lx-music-data/lx_list.lxmc"
const configFileModifyTimeKey = "lx-music-data/lx_list_modify_time.txt"
const sourceFilePath = "lx-music-sources/"

async function getFile(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    })

    const response = await s3Client.send(command)
    
    // 将流转换为 Buffer
    const chunks: Buffer[] = []
    if (response.Body && typeof response.Body === "object" && typeof (response.Body as any).pipe === "function") {
      const stream = response.Body as NodeJS.ReadableStream
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
    } else {
      throw new Error("Response body is not a readable stream.")
    }
    const body = Buffer.concat(chunks)

    return {
      body,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      metadata: response.Metadata
    }
  } catch (error) {
    console.error('Error getting file from S3:', error)
    throw error
  }
}

async function putFile(key: string, body: Buffer) {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body
    })

    const response = await s3Client.send(command)
    return response
  } catch (error) {
    console.error('Error putting file to S3:', error)
    throw error
  }
}

export const readLxConfigFileS3 = async () => {
    const { body } = await getFile(configFileKey)
    let data = await gunzipData(body)
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

export const readLxConfigFileModifyTimeS3 = async () => {
    const { body } = await getFile(configFileModifyTimeKey)
    return Number(body.toString("utf-8"))
}

export const saveLxConfigFileS3 = async (data: any, callback: Function) => {
    try {
        await putFile(configFileKey, await gzipData(JSON.stringify(data)))
        callback("歌单上传成功")
    } catch (err: any) {
        console.log(err)
        callback("上传歌单失败，" + err?.message)
    }
}

export const saveLxConfigFileModifyTimeS3 = async (timestamp: number) => {
    try {
        await putFile(configFileModifyTimeKey, Buffer.from(timestamp.toString(), "utf-8"))
    } catch (err: any) {
        console.log(err)
    }
}
