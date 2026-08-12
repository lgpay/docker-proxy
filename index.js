'use strict'

/**
 * Docker Hub 镜像代理
 * - /              返回使用说明页
 * - /token         代理 auth.docker.io 的 token 请求
 * - 其余路径        代理 registry-1.docker.io（Docker Hub  registry）
 */
const hub_host = 'registry-1.docker.io'
const auth_url = 'https://auth.docker.io'

const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
}

function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, {status, headers})
}

function newUrl(urlStr) {
    try {
        return new URL(urlStr)
    } catch (err) {
        return null
    }
}

/** 取上游请求头（透传常见请求头，并固定 Host） */
function upstreamHeaders(request, host) {
    return {
        'Host': host,
        'User-Agent': request.headers.get('User-Agent') || '',
        'Accept': request.headers.get('Accept') || '',
        'Accept-Language': request.headers.get('Accept-Language') || '',
        'Accept-Encoding': request.headers.get('Accept-Encoding') || '',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
    }
}

/**
 * @param {Request} request
 * @param {object} ctx Workers 运行上下文（用于 waitUntil）
 */
async function fetchHandler(request, ctx) {
    const url = new URL(request.url)
    const workers_url = url.origin // 动态取自身域名，避免硬编码

    if (url.pathname === '/') {
        return new Response(homeHtml(workers_url), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
    }

    if (url.pathname === '/token') {
        const token_parameter = { headers: upstreamHeaders(request, 'auth.docker.io') }
        const token_url = auth_url + url.pathname + url.search
        return fetch(new Request(token_url, request), token_parameter)
    }

    // 其余路径代理到 Docker Hub registry
    url.hostname = hub_host
    const parameter = { headers: upstreamHeaders(request, hub_host) }
    if (request.headers.has('Authorization')) {
        parameter.headers.Authorization = request.headers.get('Authorization')
    }

    // 边缘缓存：仅缓存 GET、无 Range、且为内容寻址的 blobs（manifest 按 tag 可变，不缓存）
    if (request.method === 'GET' && !request.headers.has('range') && url.pathname.includes('/blobs/')) {
        const cache = caches.default
        const cacheKey = new Request(url.href)
        const cached = await cache.match(cacheKey)
        if (cached) return cached
        const res = await proxy(new Request(url, request), parameter, workers_url)
        if (res.status === 200 || res.status === 206) {
            const copy = res.clone()
            copy.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400')
            if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, copy))
            else await cache.put(cacheKey, copy)
        }
        return res
    }

    return proxy(new Request(url, request), parameter, workers_url)
}

/**
 * @param {Request} request
 * @param {RequestInit} parameter
 * @param {string} workers_url 自身域名（用于重写 Www-Authenticate）
 */
async function proxy(request, parameter, workers_url) {
    const res = await fetch(request, parameter)
    const resHdrNew = new Headers(res.headers)
    const status = res.status

    // 把 401 里的 auth 地址改写成代理自身的 /token，让 docker 客户端向代理取 token
    if (resHdrNew.has('Www-Authenticate')) {
        const re = new RegExp(auth_url, 'g')
        resHdrNew.set('Www-Authenticate', resHdrNew.get('Www-Authenticate').replace(re, workers_url))
    }

    // 跟随 Location（多为 blob/层下载重定向到 CDN）
    if (resHdrNew.has('Location')) {
        const loc = resHdrNew.get('Location')
        const locUrl = newUrl(loc)
        if (locUrl) {
            const locReq = new Request(locUrl, {
                method: 'GET',
                redirect: 'follow',
                headers: { 'Host': locUrl.host, 'User-Agent': request.headers.get('User-Agent') || '' }
            })
            return proxy(locReq, {}, workers_url)
        }
    }

    resHdrNew.set('access-control-expose-headers', '*')
    resHdrNew.set('access-control-allow-origin', '*')
    resHdrNew.set('Cache-Control', 'max-age=1500')

    resHdrNew.delete('content-security-policy')
    resHdrNew.delete('content-security-policy-report-only')
    resHdrNew.delete('clear-site-data')

    return new Response(res.body, { status, headers: resHdrNew })
}

function homeHtml(origin) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dockerhub镜像加速说明</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f7fa; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { font-size: 2em; margin-bottom: 0.5em; color: #007aff; }
        pre { background: #2d2d2d; color: #f8f8f2; padding: 20px; border-radius: 8px; overflow-x: auto; position: relative; }
        code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; font-size: 0.875em; }
    </style>
</head>
<body>
    <div class="container">
        <center><h1>镜像加速说明</h1></center>
        <h3>为了加速镜像拉取，你可以使用以下命令设置 registry mirror:</h3>
        <pre><code>sudo tee /etc/docker/daemon.json &lt;&lt;EOF
{
    "registry-mirrors": ["${origin}"]
}
EOF</code></pre>
        <h3>用法:</h3>
        <p>原拉取镜像命令</p>
        <pre><code>docker pull library/alpine:latest</code></pre>
        <h3>加速拉取镜像命令</h3>
        <pre><code>docker pull ${origin}/library/alpine:latest</code></pre>
    </div>
</body>
</html>`
}

export default {
    async fetch(request, env, ctx) {
        try {
            return await fetchHandler(request, ctx)
        } catch (err) {
            return makeRes('cfworker error:\n' + err.stack, 502)
        }
    }
}
