@echo off
rem 内网消息接收端 - 一键安装并启动（每台 PC 双击一次即可，无需管理员）
rem 作用：注册"登录自启" + 后台常驻轮询平台消息（无窗口）
chcp 65001 >nul
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0内网消息接收端.ps1"
