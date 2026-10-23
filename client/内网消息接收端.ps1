# ============================================================
#  内网消息接收端（Windows 10 / Windows 11 通用）
#  作用：常驻后台，每 15 秒向内网管理平台查询有没有发给本机
#        的消息；有则弹出 msg 窗口。首次运行自动注册"登录自启"。
#  用法：普通用户双击「安装消息接收端.bat」即可（无需管理员）。
#        如需指定 IP / 间隔：powershell -File 本文件 -Ip 192.168.102.104
# ============================================================
param(
  [string]$Ip = "",
  [int]$Interval = 15,
  [string]$Key = "",
  [string]$Server = ""
)

# ---------- 配置校验（平台地址与密钥必填，见 README） ----------
if ([string]::IsNullOrEmpty($Server)) {
  $msg = "请先配置平台地址：右键编辑脚本，用参数指定 -Server http://<平台IP>:8088 -Key <采集密钥>"
  try { [System.Windows.Forms.MessageBox]::Show($msg, "内网消息接收端") | Out-Null } catch {}
  exit 1
}
if ([string]::IsNullOrEmpty($Key)) {
  $msg = "请先配置采集密钥：右键编辑脚本，用参数指定 -Key <与平台 COLLECTOR_KEY 一致>"
  try { [System.Windows.Forms.MessageBox]::Show($msg, "内网消息接收端") | Out-Null } catch {}
  exit 1
}

# ---------- 自动获取本机内网 IP（192.168.x 网卡） ----------
if ([string]::IsNullOrEmpty($Ip)) {
  try {
    $Ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -like "192.168.*" } |
      Select-Object -First 1 -ExpandProperty IPAddress)
  } catch {}
}
if ([string]::IsNullOrEmpty($Ip)) {
  $msg = "无法自动获取本机 IP，请右键编辑脚本，用参数指定：-Ip 192.168.102.xxx"
  [System.Windows.Forms.MessageBox]::Show($msg, "内网消息接收端") | Out-Null
  exit 1
}

# ---------- 单实例保护（避免重复启动） ----------
$mutex = New-Object System.Threading.Mutex($true, "LanMsgClient_$Ip")
if (-not $mutex.WaitOne(0, $false)) { exit 0 }

# ---------- 自注册：登录时自动启动（仅首次有效，交互会话可正常弹窗） ----------
$runPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$psExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
if (-not $psExe) { $psExe = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source }
if ($psExe) {
  $cmdLine = "`"$psExe`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$($MyInvocation.MyCommand.Path)`" -Ip $Ip -Interval $Interval"
  try { Set-ItemProperty -Path $runPath -Name "LanMsgClient" -Value $cmdLine -ErrorAction Stop } catch {}
}

# ---------- 日志 ----------
$log = Join-Path $env:TEMP "lan_msg_client.log"
function Log([string]$line) {
  try { Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $line) -Encoding UTF8 } catch {}
}
Log ("启动 本机IP=" + $Ip + " 服务器=" + $Server)

# ---------- 常驻轮询 ----------
while ($true) {
  try {
    $r = Invoke-RestMethod -Uri ($Server + "/api/message/pending?ip=" + $Ip) -Method Get `
      -Headers @{ "X-Collector-Key" = $Key } -TimeoutSec 10
    if ($r.message) {
      $m = $r.message
      $ok = $true
      $err = $null
      # 弹窗：本机自己 msg *（无远程权限问题）
      try {
        $p = Start-Process -FilePath "msg.exe" -ArgumentList @("*", ('"' + $m.content + '"')) `
          -WindowStyle Hidden -PassThru -ErrorAction Stop
        $null = $p.WaitForExit(15000)
        # 15 秒内没退出说明弹窗正在显示（用户尚未点确定）→ 视为成功
        if ($p.HasExited -and $p.ExitCode -ne 0) { $ok = $false; $err = "msg exit " + $p.ExitCode }
      } catch {
        $ok = $false
        $err = $_.Exception.Message
      }
      Log ("收到消息 id=" + $m.id + " ok=" + $ok + " err=" + $err)
      $body = @{ messageId = $m.id; ip = $Ip; ok = $ok; error = $err } | ConvertTo-Json
      try {
        $null = Invoke-RestMethod -Uri ($Server + "/api/message/result") -Method Post `
          -Headers @{ "X-Collector-Key" = $Key } -ContentType "application/json; charset=utf-8" `
          -Body $body -TimeoutSec 10
      } catch {}
    }
  } catch {}
  Start-Sleep -Seconds $Interval
}
