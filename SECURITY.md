# Security / 安全

## Report privately / 私密报告

Please use [GitHub private vulnerability reporting](https://github.com/elorinlabs/Interlude/security/advisories/new)
for security issues. Do not attach account tokens, passwords, authenticator
secrets, credential files, decrypted backups or unredacted logs to public issues.

安全问题请使用上述 GitHub 私密漏洞报告入口。不要在公开 Issue 中上传令牌、
密码、验证器密钥、凭据文件、解密后的备份或未经脱敏的日志。

## Data handling / 数据处理

- Accounts are managed locally. Optional directory backups delegate transport
  to your chosen sync client; Interlude does not require its former sync server.
- Saved automatic-login credentials use the system credential store. Portable
  complete backups include saved passwords and TOTP secrets inside encryption.
- Keep backup passphrases and recovery keys separately from their files. Losing
  them can make backups unrecoverable. Treat exported account files as secrets.
- Browser authorization may still require manual action for account challenges.
  Interlude does not guarantee permanent login or bypass provider protections.

账号在本机管理；可选目录备份由你选择的同步客户端传输。保存的自动登录信息使用
系统凭据库，完整备份会加密包含已保存的密码和验证器密钥。请分开保管备份文件
与密码／恢复密钥。服务方要求人工验证时仍需本人操作，无法保证永久免登录。

## Supported release / 支持范围

Please reproduce issues on the latest published Windows release. At this first
public release, installers are not code-signed. Verify the published SHA-256
checksum before installing. No response-time SLA is promised.

请优先在最新 Windows 发布版复现问题。当前安装包未做代码签名，安装前可核对
发布页的 SHA-256 校验值。项目不承诺固定安全响应时限。
