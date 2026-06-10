window.AZURE_TRANSLATOR_GUIDE_MARKDOWN = String.raw`# 微软 Azure 翻译服务申请与配置

## 1. 接口申请

1. 打开 [微软的接口平台](https://azure.microsoft.com/)。
2. 点击“免费试用 Azure”。
![开通页面](/assets/docs/images/microsoft-1.png)
3. 跳转到登录页面后，使用微软账号登录；如果没有账号，先注册再登录。
![登录页面](/assets/docs/images/microsoft-2.png)

![开通步骤](/assets/docs/images/microsoft-3.png)

![短信验证](/assets/docs/images/microsoft-4.png)
4. 按页面提示开通 Azure 服务。
5. 过程中可能会依次遇到：
   - 同意服务条款
   - 短信验证
   - 信用卡绑定
   - 邮箱或其他身份验证


![绑定信用卡](/assets/docs/images/microsoft-5.png)

## 2. 创建翻译服务

1. 打开 [微软翻译设置](https://portal.azure.com/)。
2. 在 Azure 中申请翻译服务。
![新建翻译服务](/assets/docs/images/microsoft-6.png)

![创建服务窗口](/assets/docs/images/microsoft-7.png)

3. 创建服务时 **重点注意**定价层一定要选F0，这是完全不付费的一档，然后位置/区域建议选择：

\`East Asia\`

![点击创建](/assets/docs/images/microsoft-8.png)

4. 后续配置密钥时会用到这个区域参数。
5. 点击“审阅并创建”。
6. 等待服务创建完成。
7. 创建完成后，可以在 Azure 首页 - 所有资源 查看你的翻译服务：

## 3. 获取密钥与区域

打开 [Azure 首页 - 所有资源](https://portal.azure.com/#servicemenu/Microsoft_Azure_Resources/ResourceManager/browseAll)

然后点击进入你创建的翻译引擎
![查看翻译服务](/assets/docs/images/microsoft-10.png)

![查看密钥和区域](/assets/docs/images/microsoft-11.png)
在 Azure 翻译服务详情页中，记录以下信息并填写到本工具的配置项里：

- \`secretKey\` 密钥
- \`region\` 区域


注意：

- 如果位置/区域显示为“全球 / global”，则 \`region\` 可以不填。
- 如果不是 \`global\`，后续配置时必须带上 \`region\` 区域。`;
