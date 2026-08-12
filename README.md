# docker-proxy

一个运行在 [Cloudflare Workers](https://workers.cloudflare.com/) 上的 **Docker Hub 镜像代理 / 加速** 项目，用于加速 `docker pull`，规避 Docker Hub 拉取限流。

## 功能

- 代理 `registry-1.docker.io`（Docker Hub 镜像/层下载）
- 代理 `auth.docker.io` 的 token 请求（`/token`）
- 自动把 401 响应里的 `Www-Authenticate` 改写成代理自身域名，让 Docker 客户端向代理取 token
- 边缘缓存：对内容寻址的 `/blobs/`（层文件）按 URL 缓存到 Cloudflare 边缘，重复拉取更快
- **动态域名**：不再硬编码代理地址，部署到任意域名都能正常工作
- 首页返回使用说明

## 用法

### 1. 配置 registry mirror（推荐）

```bash
tee /etc/docker/daemon.json <<EOF
{
    "registry-mirrors": ["https://你的域名"]
}
EOF
sudo systemctl restart docker
```

之后所有 `docker pull` 都会走该镜像加速。

### 2. 直接前缀拉取

```bash
# 原命令
docker pull library/alpine:latest

# 加速命令
docker pull 你的域名/library/alpine:latest
```

## 本地开发 / 部署

```bash
# 安装依赖（已锁定 wrangler 版本，避免 npx 拉到坏的 latest）
npm install

# 本地预览
wrangler dev

# 部署到 Cloudflare
wrangler deploy
```

`wrangler.toml` 说明：

| 字段 | 含义 |
| --- | --- |
| `name` | Worker 名称 |
| `main` | 入口文件 |
| `compatibility_date` | 运行时兼容日期 |

> 自定义域名（如 `docker.3w.pm`）在 Cloudflare 控制台绑定，不写在 `wrangler.toml` 里。

## Git 自动部署

本项目已通过 Cloudflare 控制台的 **Git 集成** 绑定 GitHub 仓库：push 到 `master` 即自动构建部署。构建命令为 `wrangler deploy`，依赖 `package.json` 中锁定的 `wrangler` 版本。

## 说明

- manifest（`/manifests/…`）按 tag 是可变的，故不做缓存，避免返回陈旧内容；只有不可变的 `/blobs/` 走边缘缓存。
- 该代理仅做请求转发，不存储任何镜像内容。
