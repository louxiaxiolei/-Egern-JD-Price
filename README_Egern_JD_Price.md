# Egern 京东比价

文件：
- `JD_Price_Egern.js`：Egern 原生脚本
- `JD_Price_Egern.yaml`：Egern 模块

## 部署
1. 在 GitHub 新建一个公开仓库，例如 `Egern-JD-Price`。
2. 上传这两个文件。
3. 打开 `JD_Price_Egern.js`，复制 RAW 地址。
4. 编辑 `JD_Price_Egern.yaml`，把两处 `script_url` 替换为刚才的 RAW 地址。
5. 再复制 `JD_Price_Egern.yaml` 的 RAW 地址。
6. Egern → 模块 → 添加远程模块 → 粘贴 YAML 的 RAW 地址并启用。
7. 确保 Egern 的 MITM 证书已安装并信任。

## 首次使用
1. 开启 Egern。
2. 打开“慢慢买”App，进入“我的”页面。
3. 正常情况下会收到“获取 CK 成功🎉”通知。
4. 然后打开京东商品详情页。
5. 命中 `in.m.jd.com/product/graphext/<商品ID>.html` 后，会在页面插入价格表。

## 版本
默认使用 V1。
脚本读取 Egern 持久化键 `mmb_v`；如之后需要 V2，可把该键设置为 `V2`。
