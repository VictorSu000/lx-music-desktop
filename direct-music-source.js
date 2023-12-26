/**
 * @name 试听源
 * @description 来源于旧版洛雪（手机版）、listen1、和github issue提供
 * @version 1.0.0
 * @author VictorSu
 */

const { EVENT_NAMES, request, on, send, utils: lxUtils } = globalThis.lx

const md5 = str => utils.crypto.md5(str)

const utils = {
  buffer: {
    from: lxUtils.buffer.from,
    bufToString: lxUtils.buffer.bufToString,
  },
  crypto: {
    aesEncrypt: lxUtils.crypto.aesEncrypt,
    md5: lxUtils.crypto.md5,
    randomBytes: lxUtils.crypto.randomBytes,
    rsaEncrypt: lxUtils.crypto.rsaEncrypt,
  },
}

const timeout = 15000

const httpRequest = (url, options) => new Promise((resolve, reject) => {
  request(url, options, (err, resp) => {
    console.log("request", url)
    if (err) {
      console.error("request failed", err)
      return reject(err)
    }
    console.log("request ok", resp.body)
    resolve(resp)
  })
})

function getKgMusicUrl(songInfo, type) {
  // 来源：https://github.com/lyswhut/lx-music-desktop/issues/1624
  let key = md5(hash.toLowerCase()+'kgcloudv2100500')
  let target_url = `http://trackercdn.kugou.com/i/v2/?cmd=26&key=${key}&hash=${hash.toLowerCase()}&pid=1&behavior=play&mid=0&appid=1005&userid=0&version=8876&vipType=0&token=0`
  return httpRequest(target_url, {
    method: 'get',
    timeout,
  }).then(({ body }) => {
    // console.log(body)

    if (body.status !== 1) return Promise.reject(new Error(`该歌曲似乎要收费……,code:${data.status}`))

    // then中返回值会隐式被包装成resolved的promise
    return body.url[0]
  })  // then返回的promise会下一个then接收链式调用
}

function getKwMusicUrl(songInfo, type) {
  // failed
  // 来源手机版洛雪
  const target_url = `http://www.kuwo.cn/api/v1/www/music/playUrl?mid=${songInfo.songmid}&type=music&br=${type}`
  return httpRequest(target_url, {
    method: 'get',
    timeout,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:82.0) Gecko/20100101 Firefox/82.0',
      Referer: 'http://kuwo.cn/',
      Secret: '14da58a88a83170f11c3a63bb0ff6aec68a7487b64551a1f997356d719980a2b028f34f5',
      cookie: 'Hm_Iuvt_cdb524f42f0cer9b268e4v7y734w5esq24=4cGcsx3ej3tkYfeGrFtdS2kSZ6YD3nbD',
    },
    credentials: 'omit',
  }).then(({ body }) => {
    // console.log(JSON.stringify(body))
    if (body.code != 200) return Promise.reject(new Error('failed'))

    return body.data.url
  })
}

function getTxMusicUrl(songInfo, type) {
  // 来源手机版洛雪，洛雪注释from https://github.com/listen1/listen1_chrome_extension/blob/master/js/provider/qq.js
  const fileConfig = {
    '128k': {
      s: 'M500',
      e: '.mp3',
      bitrate: '128kbps',
    },
    '320k': {
      s: 'M800',
      e: '.mp3',
      bitrate: '320kbps',
    },
    flac: {
      s: 'F000',
      e: '.flac',
      bitrate: 'FLAC',
    },
  }
  const target_url = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
  // thanks to https://github.com/Rain120/qq-music-api/blob/2b9cb811934888a532545fbd0bf4e4ab2aea5dbe/routers/context/getMusicPlay.js
  const guid = '10000'
  const songmidList = [songInfo.songmid]
  const uin = '0'

  const fileInfo = fileConfig[type]
  const file =
    songmidList.length === 1 &&
    `${fileInfo.s}${songInfo.songmid}${songInfo.songmid}${fileInfo.e}`

  const reqData = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        filename: file ? [file] : [],
        guid,
        songmid: songmidList,
        songtype: [0],
        uin,
        loginflag: 1,
        platform: '20',
      },
    },
    loginUin: uin,
    comm: {
      uin,
      format: 'json',
      ct: 24,
      cv: 0,
    },
  }
  return httpRequest(`${target_url}?format=json&data=${JSON.stringify(reqData)}`, {
    method: 'get',
    timeout,
  }).then(({ body }) => {
    // console.log(body)

    const { purl } = body.req_0.data.midurlinfo[0]

    // vip
    if (purl === '') return Promise.reject(new Error('failed'))

    const url = body.req_0.data.sip[0] + purl

    return url
  })
}

let cookie = 'os=pc'

function getWyMusicUrl(songInfo, type) {
  // 来源：https://github.com/lyswhut/lx-music-desktop/issues/1624
  
  const buf2hex = buffer => { 
    return version
      ? utils.buffer.bufToString(buffer, 'hex')
      : [...new Uint8Array(buffer)]
          .map(x => x.toString(16).padStart(2, '0'))
          .join('')
  }

  const aesEncrypt = (data, eapiKey, iv, mode) => {
    if (!version) {
      mode = mode.split('-').pop()
    }
    return utils.crypto.aesEncrypt(data, mode, eapiKey, iv)
  }

  const qualitys = {
    '128k': 128000,
    '320k': 320000,
    flac: 999000,
  }
  const eapi = (url, object) => {
    const eapiKey = 'e82ckenh8dichen8'

    const text = typeof object === 'object' ? JSON.stringify(object) : object
    const message = `nobody${url}use${text}md5forencrypt`
    const digest = md5(message)
    const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
    return {
      params: buf2hex(aesEncrypt(data, eapiKey, '', 'aes-128-ecb')).toUpperCase(),
    }
  }
  
  const quality = qualitys[type]
  const target_url = 'https://interface3.music.163.com/eapi/song/enhance/player/url'
  const eapiUrl = '/api/song/enhance/player/url'
  const d = {
    ids: `[${songmid}]`,
    br: quality,
  }
  const data = eapi(eapiUrl, d)

  return httpRequest(target_url, {
    method: 'POST',
    timeout,
    form: data,
    headers: {
      cookie,
    },
  }).then(({ headers, body }) => {
    // console.log(body)

    if (headers.cookie) cookie = headers.cookie

    const { url } = body.data[0]
    if (!url) return Promise.reject(new Error('failed'))
    return url
  })
}

function getMgMusicUrl(songInfo, type) {
  // failed
  // 来源手机版洛雪，from https://github.com/listen1/listen1_chrome_extension/blob/master/js/provider/migu.js
  const qualitys = {
    '128k': 'PQ',
    '320k': 'HQ',
    flac: 'SQ',
    flac32bit: 'ZQ',
  }
  const quality = qualitys[type]
  const target_url = `https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.2?netType=01&resourceType=E&songId=${songInfo.songmid}&toneFlag=${quality}`
  return httpRequest(target_url, {
    method: 'get',
    timeout,
    headers: {
      channel: '0146951',
      uid: 1234,
    },
  }).then(({ body }) => {
    // console.log(body)

    let playUrl = body.data?.url
    if (!playUrl) return Promise.reject(new Error('failed'))

    if (playUrl.startsWith('//')) playUrl = `https:${playUrl}`

    return playUrl.replace(/\+/g, '%2B')
  })
}

const apis = {
  kg: getKgMusicUrl,
  kw: getKwMusicUrl,
  tx: getTxMusicUrl,
  wy: getWyMusicUrl,
  mg: getMgMusicUrl,
}

// 注册应用API请求事件
// source 音乐源，可能的值取决于初始化时传入的sources对象的源key值
// info 请求附加信息，内容根据action变化
// action 请求操作类型，目前只有musicUrl，即获取音乐URL链接，
//    当action为musicUrl时info的结构：{type, musicInfo}，
//        info.type：音乐质量，可能的值有128k / 320k / flac / flac24bit（取决于初始化时对应源传入的qualitys值中的一个），
//        info.musicInfo：音乐信息对象，里面有音乐ID、名字等信息
on(EVENT_NAMES.request, ({ source, action, info }) => {
  console.error("call api")
  // 被调用时必须返回 Promise 对象
  switch (action) {
    // action 为 musicUrl 时需要在 Promise 返回歌曲 url
    case 'musicUrl':
      return apis[source](info.musicInfo, info.type).catch(err => {
        console.log(err)
        return Promise.reject(err)
      })
  }
})

// 脚本初始化完成后需要发送inited事件告知应用
// 注意：初始化事件被发送前，执行脚本的过程中出现任何错误将视为脚本初始化失败
send(EVENT_NAMES.inited, {
  status: true,
  openDevTools: false, // 是否打开开发者工具，方便用于调试脚本
  sources: { // 当前脚本支持的源
    kg: {
      name: '酷狗音乐',
      type: 'music',  // 目前固定为 music
      actions: ['musicUrl'], // 目前固定为 ['musicUrl']
      qualitys: ['128k', '320k', 'flac', 'flac24bit'], // 当前脚本的该源所支持获取的Url音质，有效的值有：['128k', '320k', 'flac', 'flac24bit']
    },
    kw: { // 支持的源对象，可用key值：kw/kg/tx/wy/mg
      name: '酷我音乐',
      type: 'music',  // 目前固定为 music
      actions: ['musicUrl'], // 目前固定为 ['musicUrl']
      qualitys: ['128k', '320k', 'flac', 'flac24bit'], // 当前脚本的该源所支持获取的Url音质，有效的值有：['128k', '320k', 'flac', 'flac24bit']
    },
    mg: {
      name: '咪咕音乐',
      type: 'music',  // 目前固定为 music
      actions: ['musicUrl'], // 目前固定为 ['musicUrl']
      qualitys: ['128k', '320k', 'flac', 'flac24bit'], // 当前脚本的该源所支持获取的Url音质，有效的值有：['128k', '320k', 'flac', 'flac24bit']
    },
    tx: {
      name: '企鹅音乐',
      type: 'music',  // 目前固定为 music
      actions: ['musicUrl'], // 目前固定为 ['musicUrl']
      qualitys: ['128k', '320k', 'flac', 'flac24bit'], // 当前脚本的该源所支持获取的Url音质，有效的值有：['128k', '320k', 'flac', 'flac24bit']
    },
    wy: {
      name: '网易音乐',
      type: 'music',  // 目前固定为 music
      actions: ['musicUrl'], // 目前固定为 ['musicUrl']
      qualitys: ['128k', '320k', 'flac', 'flac24bit'], // 当前脚本的该源所支持获取的Url音质，有效的值有：['128k', '320k', 'flac', 'flac24bit']
    },
  },
})
