'use strict'

/**
 * Docker Hub 镜像代理
 * - /              返回使用说明页
 * - /token         代理 auth.docker.io 的 token 请求
 * - 其余路径        代理 registry-1.docker.io（Docker Hub  registry）
 */
const hub_host = 'registry-1.docker.io'
const auth_url = 'https://auth.docker.io'

// favicon.ico（PNG 内容，base64 内联，避免依赖外部静态资源）
const FAVICON_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEEAAABBCAYAAACO98lFAAAACXBIWXMAAAsSAAALEgHS3X78AAAFAElEQVR42u1cO5LbOBB9ZimXbiA5YSr6BGbAfJQxNH0Ca04wnBOsbmBOyEzKWbXUCUxlLkbSDaQq57PBtmws1PjwO+RoUYUEQ4ro168/aADz4fX1FX00NwhnADzqM82jZwAFgKLM0nMfc/vQFQgk9AqAT31e42dOAHLq265AaR0ENwgjEv6hg/nuCIxkcCCQ1tcAopoar8OQBMCmDXY0BoE0vwEwrfDaXvM3r8JvXQCsmzKjNghuEHqkjaXh0YNg17mN5ohZvtBtvhGVWVr0BoIbhGsAfxk0dKXrsQVzWwjmpmPJY5mlm05BIA0lGqd3AhC37bgY84s1vmdHrDi3DgIBkCuoeSGtx+ipuUEYEzumCvPwbYGwAsEAwJ6QP6LnRmaSAPjcBAgjCAYAnvvUvoEVT3WB0IKgAaCV0NSBr+BCtREIx/DbiQIAf0gAAADNx6f5iW1JcqAyCBQGHxQAFBhgo3lxQDyQPPbmQInQD+b5r0NjgMY0vjN/+sQpcKIxA84JJi1PNJKGizJL122YBkWOJ0Yuz2gONDnZD+w7iAILCm1i91o0jZhZoyxJPjUIFA02jB+IMM4WMf5hQ3IqmcBlYJu3SIRaYsORUeqU5FSCIGv8NIRkqAWzOOnknEi+QF6UWANAjmghDZ+pc+MJJWLyeBctlqLF3A3C6Oroxeiwkn1BxWgQMd54T4JWGfe7SKTcIJSzydU1CjqCQ3ywCJNDygUWbhCead1g0xImgZqJPmHFvLQZuLnHpNknNwhtFMbJsxJBkCl4GHJEIP/zRRj6QnQ3RYqDNOyLPkEGIa8xN+6dI/Uq4zaNY+43Nwi3ZZbmhjkub0Agu5jbgqBKd6n7zDiqjFum0zONczaB8E2KErOJIlXNLdJdMOGty/EbGnPjjKPcCosmTi6PBaGvPcAGrVAANWfC7pMbhL9L8m4Q3oDgMNTajyARrFrPWArKluWbORhn21Z8/qRL/CaWIUm0wZ8AHqVHflHvbFyYw3W3+wL77TrtKnjC5PVcTP57pIy5kC/ITSCYYvNihMLvyWQSGyc/wftpL2WW1ir+OO8IhNp1D4dZw3tSzpCPhAW2KbecX5wdJuZO5Rocbut0Q3N+Vixg5AKAwlEkHm0sqPpqVWqgPgsCec/TSEGouhXgM0nU2VEI6TfM0Poyg1XFd1jlqkBYUpIkFiReBgaAX2WhR/IsdSBwml63FYI6AqDqImqtWoM4wtJ5p8u3iQ3PIwWAWz/srkxyNHY/lfftyAkd3giAAwCvDgAkx1Tl5xxBwISJErHCufQNxHOZpV6D4m+sW1rLabO85p7L5SqikN9T8eUFwMcmW4E0/7lOzv8c0qCM6ihR50I0PDIfWONP/b9Nu9/i3/OQxyY/RBGhYORZiJHFYbQse9EpFLtRdHp0QUWQU0PBXwB8pQm2dSQwYRS0lkOr6rhOwcRU43E9Qt7Hn8sdqnakfr3ccWzbjhTH+g5llt7M6/8zS6p6Aj34yC1WCKAhA+CB33d8VIVX02HOLUZ0jI8AyBk/sCuzdFW3shQxOcEUQM4dgBqACXAAHGCoNmtBEHICDojvFc4GdA1ATD6g8pFeozlI+UOOd3rK3arQqmEEaAJF36yg7xVNAbBmgsSIBPd684VJl+/zDhQTjhLc6204hp5V7kVeoN9a/1zh8297L5LR3P3ekFUw4/7uSmvYcZ+35g2gDPL/J/wDgzLhZD6cTicAAAAASUVORK5CYII='

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

    if (url.pathname === '/favicon.ico') {
        const bin = atob(FAVICON_B64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return new Response(bytes, { headers: { 'Content-Type': 'image/x-icon' } })
    }

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
<title>Docker 镜像加速 · Cloudflare Workers</title>
<link rel="icon" href="/favicon.ico">
<style>
  :root { --blue:#2496ed; --blue-d:#1d7fd1; --ink:#0f172a; --muted:#64748b; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
    background:linear-gradient(135deg,#eef2ff,#e0f2fe 55%,#f0f9ff); color:var(--ink); }
  .card { width:100%; max-width:720px; background:#fff; border-radius:18px;
    box-shadow:0 20px 50px -20px rgba(36,150,237,.35); overflow:hidden; }
  .hero { padding:32px 32px 24px; background:linear-gradient(135deg,var(--blue),#38bdf8); color:#fff; }
  .hero .logo { font-size:34px; }
  .hero h1 { margin:10px 0 6px; font-size:26px; letter-spacing:.5px; }
  .hero p { margin:0; opacity:.92; font-size:14px; }
  .body { padding:24px 32px 32px; }
  .sec { margin-top:22px; }
  .sec h2 { font-size:15px; color:var(--muted); margin:0 0 10px; font-weight:600;
    display:flex; align-items:center; gap:8px; }
  .sec h2 .tag { background:#e0f2fe; color:var(--blue-d); font-size:12px; padding:2px 8px; border-radius:999px; }
  .cmd { position:relative; background:#0d1117; color:#e6edf3; border-radius:12px; padding:16px 48px 16px 16px;
    font-family:"SFMono-Regular",Consolas,Menlo,monospace; font-size:13.5px; line-height:1.7; overflow-x:auto; }
  .cmd .k { color:#7ee787; } .cmd .s { color:#a5d6ff; }
  .copy { position:absolute; top:10px; right:10px; border:none; background:rgba(255,255,255,.12); color:#fff;
    padding:5px 10px; border-radius:7px; font-size:12px; cursor:pointer; transition:.2s; }
  .copy:hover { background:rgba(255,255,255,.25); }
  .copy.ok { background:#2ea043; }
  .field { display:flex; gap:10px; margin-top:6px; }
  .field input { flex:1; padding:12px 14px; border:1.5px solid #e2e8f0; border-radius:10px; font-size:14px; outline:none; }
  .field input:focus { border-color:var(--blue); }
  .field button { border:none; background:var(--blue); color:#fff; padding:0 18px; border-radius:10px; font-size:14px; cursor:pointer; }
  .field button:hover { background:var(--blue-d); }
  .hint { font-size:12.5px; color:var(--muted); margin-top:8px; }
  .note { margin-top:24px; font-size:12px; color:var(--muted); border-top:1px solid #f1f5f9; padding-top:14px; }
  code.inline { background:#f1f5f9; padding:2px 6px; border-radius:6px; font-size:12.5px; }
</style>
</head>
<body>
  <div class="card">
    <div class="hero">
      <div class="logo">🐳</div>
      <h1>Docker 镜像加速</h1>
      <p>基于 Cloudflare Workers 的 Docker Hub 拉取代理 · 自动边缘缓存</p>
    </div>
    <div class="body">
      <div class="sec">
        <h2>方式一 · 全局镜像（推荐）<span class="tag">一次配置</span></h2>
        <div class="cmd" id="cmd-mirror">tee /etc/docker/daemon.json <span class="s">&lt;&lt;EOF</span>
{
  "registry-mirrors": ["${origin}"]
}
EOF<span class="copy" data-target="cmd-mirror">复制</span></div>
        <div class="hint">配置后重启 Docker，所有 <code class="inline">docker pull</code> 自动走加速。</div>
      </div>

      <div class="sec">
        <h2>方式二 · 前缀拉取<span class="tag">即拉即用</span></h2>
        <div class="field">
          <input id="img" placeholder="镜像名，如 library/alpine:latest 或 nginx:alpine" />
          <button onclick="gen()">生成</button>
        </div>
        <div class="cmd" id="cmd-pull" style="margin-top:10px;"><span class="k">docker pull</span> ${origin}/library/alpine:latest<span class="copy" data-target="cmd-pull">复制</span></div>
        <div class="hint">在镜像名前加上本服务地址即可加速单次拉取。</div>
      </div>

      <div class="note">
        本服务仅做请求转发与边缘缓存，不存储任何镜像内容；manifest 按 tag 可变故不缓存，仅不可变的层（blobs）走缓存。
      </div>
    </div>
  </div>

<script>
  function copy(btn){
    var id = btn.getAttribute('data-target');
    var text = document.getElementById(id).innerText.replace('复制','').trim();
    navigator.clipboard.writeText(text).then(function(){
      btn.textContent='已复制'; btn.classList.add('ok');
      setTimeout(function(){ btn.textContent='复制'; btn.classList.remove('ok'); }, 1500);
    });
  }
  document.querySelectorAll('.copy').forEach(function(b){ b.addEventListener('click', function(){ copy(b); }); });
  function gen(){
    var v = document.getElementById('img').value.trim();
    if(!v) return;
    v = v.replace(/^https?:\/\//,'').replace(/^[^/]+\//,''); // 容错：去掉可能误贴的协议/域名
    document.getElementById('cmd-pull').innerHTML = '<span class="k">docker pull</span> ' + location.origin + '/' + v + '<span class="copy" data-target="cmd-pull">复制</span>';
    document.querySelector('#cmd-pull .copy').addEventListener('click', function(){ copy(this); });
  }
  document.getElementById('img').addEventListener('keydown', function(e){ if(e.key==='Enter') gen(); });
</script>
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
