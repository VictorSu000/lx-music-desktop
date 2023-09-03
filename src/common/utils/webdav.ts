import { createAdapter } from "webdav-fs"
import { gzipData, gunzipData } from "./nodejs"

// TODO 填上URL、用户名密码
const wfs = createAdapter("", {
    username: "",
    password: ""
})

const configFile = "/lx-music/lx_list.lxmc"


export const saveLxConfigFileWebDAV = async(data: any, callback: Function) => {
    wfs.writeFile(configFile, await gzipData(JSON.stringify(data)), "binary", err => {
        if (err === null) {
            callback("歌单上传成功")
        } else {
            console.log(err)
            callback("上传歌单失败，" + err?.message)
        }
        
    })
}
  
export const readLxConfigFileWebDAV = async () => {
    const rawData : Buffer= await new Promise((resolve, reject) => {
        wfs.readFile(configFile, "binary", (err, data) => {
            if (err) {
                reject(err)
            }
            resolve(data as Buffer)
        })
    })
    let data = await gunzipData(rawData)
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
